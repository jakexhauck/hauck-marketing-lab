// Google OAuth (Calendar + Drive).
//
// Flow: PKCE auth-code with a transient localhost listener. Tokens live in
// the app config dir (NOT the synced media-buying folder), so each machine
// authenticates once. Refresh-on-expiry happens transparently before each
// write.
//
// This module's OAuth now also covers `drive.file` (per-file Drive access).
// The on-disk token store (`google_calendar_tokens.json`) is shared with
// `drive_api.rs`, which borrows access tokens via `google_access_token`.
//
// NOTE on the "client secret": Google's own docs say desktop-app client
// secrets are not actually secrets, PKCE is what protects the flow. They
// live in the gitignored `google_oauth_secrets.rs` module because GitHub
// push protection won't let them sit in the tree. Rotate via the Cloud
// Console if ever needed.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration as StdDuration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tiny_http::{Header, Response, Server};

use crate::google_oauth_secrets::{CLIENT_ID, CLIENT_SECRET};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StoredTokens {
    access_token: String,
    refresh_token: String,
    /// Unix seconds.
    expires_at: i64,
}

fn tokens_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join("google_calendar_tokens.json"))
}

fn save_tokens(app: &AppHandle, tokens: &StoredTokens) -> Result<(), String> {
    let p = tokens_path(app)?;
    let raw = serde_json::to_string_pretty(tokens).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, raw).map_err(|e| format!("write tokens: {e}"))?;
    Ok(())
}

fn load_tokens(app: &AppHandle) -> Result<Option<StoredTokens>, String> {
    let p = tokens_path(app)?;
    if !p.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read tokens: {e}"))?;
    let tokens: StoredTokens =
        serde_json::from_str(&raw).map_err(|e| format!("parse tokens: {e}"))?;
    Ok(Some(tokens))
}

fn delete_tokens(app: &AppHandle) -> Result<(), String> {
    let p = tokens_path(app)?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("delete tokens: {e}"))?;
    }
    Ok(())
}

fn base64_url(data: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(data)
}

fn generate_pkce() -> (String, String) {
    let mut verifier_bytes = [0u8; 64];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let verifier = base64_url(&verifier_bytes);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = base64_url(&hash);
    (verifier, challenge)
}

fn random_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64_url(&bytes)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

async fn exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("code", code),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("token exchange request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("token exchange failed ({status}): {body}"));
    }
    resp.json()
        .await
        .map_err(|e| format!("parse token response: {e}"))
}

async fn refresh(refresh_token: &str) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("refresh request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("refresh failed ({status}): {body}"));
    }
    resp.json()
        .await
        .map_err(|e| format!("parse refresh response: {e}"))
}

/// Sibling-module entry point for fetching a fresh Google access token.
/// Named `google_access_token` because the underlying OAuth now covers
/// Calendar + Drive (drive.file). Thin wrapper over `access_token`.
pub(crate) async fn google_access_token(app: &AppHandle) -> Result<String, String> {
    access_token(app).await
}

/// Returns a valid access token, refreshing if it's expired or near-expiry.
async fn access_token(app: &AppHandle) -> Result<String, String> {
    let mut tokens = load_tokens(app)?.ok_or_else(|| "calendar not connected".to_string())?;
    let now = Utc::now().timestamp();
    if tokens.expires_at <= now + 60 {
        let refreshed = refresh(&tokens.refresh_token).await?;
        tokens.access_token = refreshed.access_token;
        tokens.expires_at = now + refreshed.expires_in;
        if let Some(rt) = refreshed.refresh_token {
            tokens.refresh_token = rt;
        }
        save_tokens(app, &tokens)?;
    }
    Ok(tokens.access_token)
}

fn parse_query(url: &str) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    let q = url.split_once('?').map(|x| x.1).unwrap_or("");
    for kv in q.split('&') {
        if let Some((k, v)) = kv.split_once('=') {
            let decoded = urlencoding::decode(v)
                .map(|s| s.into_owned())
                .unwrap_or_default();
            out.insert(k.to_string(), decoded);
        }
    }
    out
}

#[tauri::command]
pub async fn google_calendar_connect(app: AppHandle) -> Result<(), String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| format!("bind listener: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "could not determine listener port".to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let (verifier, challenge) = generate_pkce();
    let state = random_state();
    let scope_param = SCOPES.join(" ");

    let auth_url = format!(
        "{AUTH_URL}?client_id={cid}&redirect_uri={ru}&response_type=code&scope={sc}&access_type=offline&prompt=consent&include_granted_scopes=true&code_challenge={cc}&code_challenge_method=S256&state={st}",
        cid = urlencoding::encode(CLIENT_ID),
        ru = urlencoding::encode(&redirect_uri),
        sc = urlencoding::encode(&scope_param),
        cc = urlencoding::encode(&challenge),
        st = urlencoding::encode(&state),
    );

    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| format!("open browser: {e}"))?;

    let state_check = state.clone();
    let code = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let deadline = Instant::now() + StdDuration::from_secs(300);
        loop {
            if Instant::now() >= deadline {
                return Err("timeout waiting for Google redirect (5 min)".into());
            }
            match server.try_recv() {
                Ok(Some(req)) => {
                    let url = req.url().to_string();
                    let params = parse_query(&url);
                    let html = "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;padding:48px;background:#08090d;color:#eee\"><h2 style=\"font-weight:600\">Connected.</h2><p>You can close this tab and return to Hauck Marketing Lab.</p></body></html>";
                    let _ = req.respond(
                        Response::from_string(html).with_header(
                            "Content-Type: text/html; charset=utf-8"
                                .parse::<Header>()
                                .unwrap(),
                        ),
                    );
                    if let Some(e) = params.get("error") {
                        return Err(format!("authorization denied: {e}"));
                    }
                    if params.get("state").map(|s| s.as_str()) != Some(&state_check) {
                        return Err("state mismatch — possible CSRF, aborting".into());
                    }
                    return params
                        .get("code")
                        .cloned()
                        .ok_or_else(|| "no code in redirect".into());
                }
                Ok(None) => std::thread::sleep(StdDuration::from_millis(100)),
                Err(e) => return Err(format!("listener error: {e}")),
            }
        }
    })
    .await
    .map_err(|e| format!("listener join: {e}"))??;

    let token_resp = exchange_code(&code, &verifier, &redirect_uri).await?;
    let refresh_token = token_resp.refresh_token.ok_or_else(|| {
        "no refresh_token returned — go to https://myaccount.google.com/permissions, remove Hauck Marketing Lab, then reconnect".to_string()
    })?;
    let now = Utc::now().timestamp();
    let tokens = StoredTokens {
        access_token: token_resp.access_token,
        refresh_token,
        expires_at: now + token_resp.expires_in,
    };
    save_tokens(&app, &tokens)?;
    Ok(())
}

#[tauri::command]
pub fn google_calendar_disconnect(app: AppHandle) -> Result<(), String> {
    delete_tokens(&app)
}

#[tauri::command]
pub fn google_calendar_is_connected(app: AppHandle) -> Result<bool, String> {
    Ok(load_tokens(&app)?.is_some())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventArgs {
    pub title: String,
    /// RFC3339 with offset, e.g. "2026-05-14T10:00:00-04:00". Ignored when all_day=true.
    pub start_iso: String,
    pub end_iso: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub all_day: bool,
}

#[derive(Serialize)]
struct EventTime {
    #[serde(rename = "dateTime", skip_serializing_if = "Option::is_none")]
    date_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
}

#[derive(Serialize)]
struct EventBody {
    summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<String>,
    start: EventTime,
    end: EventTime,
}

#[derive(Deserialize)]
struct CreatedEvent {
    id: String,
}

#[tauri::command]
pub async fn google_calendar_create_event(
    app: AppHandle,
    args: CreateEventArgs,
) -> Result<String, String> {
    let token = access_token(&app).await?;
    let body = if args.all_day {
        EventBody {
            summary: args.title,
            description: args.description,
            location: args.location,
            start: EventTime {
                date_time: None,
                date: Some(args.start_iso.chars().take(10).collect()),
            },
            end: EventTime {
                date_time: None,
                date: Some(args.end_iso.chars().take(10).collect()),
            },
        }
    } else {
        EventBody {
            summary: args.title,
            description: args.description,
            location: args.location,
            start: EventTime {
                date_time: Some(args.start_iso),
                date: None,
            },
            end: EventTime {
                date_time: Some(args.end_iso),
                date: None,
            },
        }
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("create event request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("create event failed ({status}): {text}"));
    }
    let created: CreatedEvent = resp
        .json()
        .await
        .map_err(|e| format!("parse created event: {e}"))?;
    Ok(created.id)
}

#[tauri::command]
pub async fn google_calendar_update_event(
    app: AppHandle,
    event_id: String,
    args: CreateEventArgs,
) -> Result<(), String> {
    let token = access_token(&app).await?;
    let body = if args.all_day {
        EventBody {
            summary: args.title,
            description: args.description,
            location: args.location,
            start: EventTime {
                date_time: None,
                date: Some(args.start_iso.chars().take(10).collect()),
            },
            end: EventTime {
                date_time: None,
                date: Some(args.end_iso.chars().take(10).collect()),
            },
        }
    } else {
        EventBody {
            summary: args.title,
            description: args.description,
            location: args.location,
            start: EventTime {
                date_time: Some(args.start_iso),
                date: None,
            },
            end: EventTime {
                date_time: Some(args.end_iso),
                date: None,
            },
        }
    };

    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{}",
        urlencoding::encode(&event_id)
    );
    let resp = client
        .patch(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("update event request: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("update event failed ({status}): {text}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn google_calendar_delete_event(
    app: AppHandle,
    event_id: String,
) -> Result<(), String> {
    let token = access_token(&app).await?;
    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{}",
        urlencoding::encode(&event_id)
    );
    let resp = client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("delete event request: {e}"))?;
    let status = resp.status();
    if !status.is_success() && status.as_u16() != 410 {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("delete event failed ({status}): {text}"));
    }
    Ok(())
}
