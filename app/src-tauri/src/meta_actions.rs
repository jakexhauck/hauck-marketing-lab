// Meta Marketing API mutation commands for the Ads Manager surface.
//
// Mirrors the read-only `graph_get` pattern in `meta_ads.rs` but for POST /
// DELETE requests. Used by the renderer to pause, resume, update budget, and
// duplicate campaigns / ad sets / ads without bouncing out to Ads Manager.
//
// API ref: https://developers.facebook.com/docs/marketing-api/reference
// Base URL: https://graph.facebook.com/v21.0
//
// Every mutation that returns Ok also clears the Meta ads disk cache so the
// next `meta_list_ads_insights` call fetches fresh state from Graph.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::meta_ads::clear_cache_inner;
use crate::meta_oauth_secrets::META_SYSTEM_USER_TOKEN;

const API_BASE: &str = "https://graph.facebook.com/v21.0";

// ── HTTP helpers ──────────────────────────────────────────────

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .expect("reqwest build")
}

/// POST against the Graph API. `form` is sent as application/x-www-form-urlencoded
/// (which is what Meta expects for Marketing API writes). The access token is
/// appended automatically. On non-2xx, the JSON body is surfaced verbatim so
/// rate-limit / permission / validation errors are visible to the user.
async fn graph_post(path: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    if META_SYSTEM_USER_TOKEN.is_empty() {
        return Err(
            "Meta System User token not configured, paste it into meta_oauth_secrets.rs".into(),
        );
    }
    let url = format!("{API_BASE}{path}");
    let mut body: Vec<(&str, &str)> = form.to_vec();
    body.push(("access_token", META_SYSTEM_USER_TOKEN));
    let resp = http()
        .post(&url)
        .form(&body)
        .send()
        .await
        .map_err(|e| format!("Meta POST {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Meta POST {path} ({status}): {text}"));
    }
    if text.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text)
        .map_err(|e| format!("Meta parse {path}: {e}, body: {text}"))
}

/// DELETE against the Graph API. Kept for completeness even though current
/// callers only need POST, so future delete-campaign/ad flows can land
/// without re-plumbing.
#[allow(dead_code)]
async fn graph_delete(path: &str) -> Result<Value, String> {
    if META_SYSTEM_USER_TOKEN.is_empty() {
        return Err(
            "Meta System User token not configured, paste it into meta_oauth_secrets.rs".into(),
        );
    }
    let url = format!("{API_BASE}{path}");
    let resp = http()
        .delete(&url)
        .query(&[("access_token", META_SYSTEM_USER_TOKEN)])
        .send()
        .await
        .map_err(|e| format!("Meta DELETE {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Meta DELETE {path} ({status}): {text}"));
    }
    if text.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text)
        .map_err(|e| format!("Meta parse {path}: {e}, body: {text}"))
}

// ── shared structs ────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateResult {
    pub new_id: String,
}

// ── internal helpers ──────────────────────────────────────────

/// Set status on any object (campaign / ad set / ad). Meta accepts `status`
/// as a form field on POST /{object_id}.
async fn set_status(object_id: &str, status: &str) -> Result<(), String> {
    let path = format!("/{object_id}");
    graph_post(&path, &[("status", status)]).await?;
    Ok(())
}

/// Set daily_budget on a campaign or ad set. Meta wants the value in the ad
/// account's currency minor units (cents for USD).
async fn set_daily_budget(object_id: &str, daily_budget_cents: i64) -> Result<(), String> {
    if daily_budget_cents <= 0 {
        return Err("daily_budget_cents must be greater than 0".into());
    }
    let path = format!("/{object_id}");
    let budget = daily_budget_cents.to_string();
    graph_post(&path, &[("daily_budget", &budget)]).await?;
    Ok(())
}

/// Duplicate a campaign / ad set / ad. Always defaults the copy to PAUSED
/// status so a stray click does not start fresh spend.
async fn duplicate_object(object_id: &str) -> Result<DuplicateResult, String> {
    let path = format!("/{object_id}/copies");
    let body = graph_post(
        &path,
        &[("deep_copy", "true"), ("status_option", "PAUSED")],
    )
    .await?;
    // Meta returns either `{ "copied_<kind>_id": "...", "ad_object_ids": [...] }`
    // (older shape) or `{ "id": "..." }` (newer shape). Pull whichever is
    // present.
    let new_id = body
        .get("copied_campaign_id")
        .and_then(|v| v.as_str())
        .or_else(|| body.get("copied_adset_id").and_then(|v| v.as_str()))
        .or_else(|| body.get("copied_ad_id").and_then(|v| v.as_str()))
        .or_else(|| body.get("id").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Meta duplicate returned no id, body: {body}"))?;
    Ok(DuplicateResult { new_id })
}

fn bust_cache(app: &AppHandle) {
    // Cache busting is best-effort. If it fails (e.g. config dir missing),
    // the worst case is the next fetch returns stale data for up to 15 min,
    // which is not worth bubbling up as an error after a successful mutation.
    let _ = clear_cache_inner(app);
}

// ── Tauri commands: pause / resume ────────────────────────────

#[tauri::command]
pub async fn meta_pause_campaign(app: AppHandle, campaign_id: String) -> Result<(), String> {
    set_status(&campaign_id, "PAUSED").await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_resume_campaign(app: AppHandle, campaign_id: String) -> Result<(), String> {
    set_status(&campaign_id, "ACTIVE").await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_pause_ad(app: AppHandle, ad_id: String) -> Result<(), String> {
    set_status(&ad_id, "PAUSED").await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_resume_ad(app: AppHandle, ad_id: String) -> Result<(), String> {
    set_status(&ad_id, "ACTIVE").await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_pause_ad_set(app: AppHandle, adset_id: String) -> Result<(), String> {
    set_status(&adset_id, "PAUSED").await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_resume_ad_set(app: AppHandle, adset_id: String) -> Result<(), String> {
    set_status(&adset_id, "ACTIVE").await?;
    bust_cache(&app);
    Ok(())
}

// ── Tauri commands: update budget ─────────────────────────────

#[tauri::command]
pub async fn meta_update_campaign_budget(
    app: AppHandle,
    campaign_id: String,
    daily_budget_cents: i64,
) -> Result<(), String> {
    set_daily_budget(&campaign_id, daily_budget_cents).await?;
    bust_cache(&app);
    Ok(())
}

#[tauri::command]
pub async fn meta_update_ad_set_budget(
    app: AppHandle,
    adset_id: String,
    daily_budget_cents: i64,
) -> Result<(), String> {
    set_daily_budget(&adset_id, daily_budget_cents).await?;
    bust_cache(&app);
    Ok(())
}

// ── Tauri commands: duplicate ─────────────────────────────────

#[tauri::command]
pub async fn meta_duplicate_campaign(
    app: AppHandle,
    campaign_id: String,
) -> Result<DuplicateResult, String> {
    let result = duplicate_object(&campaign_id).await?;
    bust_cache(&app);
    Ok(result)
}

#[tauri::command]
pub async fn meta_duplicate_ad_set(
    app: AppHandle,
    adset_id: String,
) -> Result<DuplicateResult, String> {
    let result = duplicate_object(&adset_id).await?;
    bust_cache(&app);
    Ok(result)
}

#[tauri::command]
pub async fn meta_duplicate_ad(
    app: AppHandle,
    ad_id: String,
) -> Result<DuplicateResult, String> {
    let result = duplicate_object(&ad_id).await?;
    bust_cache(&app);
    Ok(result)
}
