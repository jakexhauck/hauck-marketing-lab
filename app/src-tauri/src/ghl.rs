// GoHighLevel (LeadConnector) v2 API integration.
//
// Holds the Private Integration Token + location ID in the app config dir
// (NOT the synced vault), and exposes Tauri commands for:
//   * listing pipelines + stages
//   * listing opportunities (used by the Sales Hub kanban)
//   * upserting contacts / opportunities and advancing pipeline stages
//     (used by OnboardingChecklist when a phase completes)
//
// Token storage mirrors `google_calendar.rs` — JSON in the per-machine
// app config dir, never the synced media-buying folder. The token never
// crosses into the renderer process; only command results do.
//
// API ref: https://highlevel.stoplight.io/docs/integrations/  (v2 / 2021-07-28)
// Base URL: https://services.leadconnectorhq.com
// Required headers: Authorization: Bearer <token>, Version: 2021-07-28

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const API_BASE: &str = "https://services.leadconnectorhq.com";
const API_VERSION: &str = "2021-07-28";

// ── config storage ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GhlConfig {
    pub private_token: String,
    pub location_id: String,
    /// GHL pipeline ID the user picked for the Sales Hub view.
    /// `None` means the hub will show a picker until one is chosen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sales_pipeline_id: Option<String>,
    /// GHL pipeline ID the user picked for the Onboarding Hub view + the
    /// destination for OnboardingChecklist phase syncs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onboarding_pipeline_id: Option<String>,
    /// GHL calendar ID the app watches for new bookings. When set, the
    /// `ghlCalendarSync` poll fetches appointments from this calendar and
    /// fans them out to: sales-pipeline stage move ("Call Booked"),
    /// Google Calendar event creation, and an `ops/appointments.json` row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub booking_calendar_id: Option<String>,
}

/// What the renderer is allowed to see about the GHL config.
/// Never includes the private token.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GhlConfigStatus {
    pub configured: bool,
    pub location_id: Option<String>,
    pub sales_pipeline_id: Option<String>,
    pub onboarding_pipeline_id: Option<String>,
    pub booking_calendar_id: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join("ghl_config.json"))
}

fn load_config(app: &AppHandle) -> Result<Option<GhlConfig>, String> {
    let p = config_path(app)?;
    if !p.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read ghl config: {e}"))?;
    let cfg: GhlConfig = serde_json::from_str(&raw).map_err(|e| format!("parse ghl config: {e}"))?;
    Ok(Some(cfg))
}

fn save_config(app: &AppHandle, cfg: &GhlConfig) -> Result<(), String> {
    let p = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize ghl: {e}"))?;
    fs::write(&p, raw).map_err(|e| format!("write ghl config: {e}"))
}

fn require_config(app: &AppHandle) -> Result<GhlConfig, String> {
    load_config(app)?.ok_or_else(|| "GHL not configured — set token + location ID first".to_string())
}

// ── HTTP helpers ───────────────────────────────────────────

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("reqwest client build")
}

async fn ghl_get(token: &str, path: &str, query: &[(&str, &str)]) -> Result<Value, String> {
    let url = format!("{API_BASE}{path}");
    let resp = client()
        .get(&url)
        .bearer_auth(token)
        .header("Version", API_VERSION)
        .header("Accept", "application/json")
        .query(query)
        .send()
        .await
        .map_err(|e| format!("GHL GET {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("GHL GET {path} ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("GHL parse {path}: {e} — body: {text}"))
}

async fn ghl_post(token: &str, path: &str, body: &Value) -> Result<Value, String> {
    let url = format!("{API_BASE}{path}");
    let resp = client()
        .post(&url)
        .bearer_auth(token)
        .header("Version", API_VERSION)
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GHL POST {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("GHL POST {path} ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("GHL parse {path}: {e} — body: {text}"))
}

async fn ghl_put(token: &str, path: &str, body: &Value) -> Result<Value, String> {
    let url = format!("{API_BASE}{path}");
    let resp = client()
        .put(&url)
        .bearer_auth(token)
        .header("Version", API_VERSION)
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("GHL PUT {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("GHL PUT {path} ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("GHL parse {path}: {e} — body: {text}"))
}

// ── data shapes returned to the renderer ────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlStage {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub position: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlPipeline {
    pub id: String,
    pub name: String,
    pub stages: Vec<GhlStage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlCalendar {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlAppointment {
    pub id: String,
    pub calendar_id: String,
    /// "confirmed" | "cancelled" | "noshow" | "showed" | "invalid" — GHL's
    /// own values; sync logic uses these verbatim.
    pub appointment_status: String,
    /// RFC3339 strings. GHL returns ISO timestamps on this endpoint.
    pub start_iso: String,
    pub end_iso: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_updated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlOpportunity {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_email: Option<String>,
    pub pipeline_id: String,
    pub pipeline_stage_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monetary_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

// ── commands ───────────────────────────────────────────────

#[tauri::command]
pub fn ghl_is_configured(app: AppHandle) -> Result<bool, String> {
    Ok(load_config(&app)?.is_some())
}

#[tauri::command]
pub fn ghl_get_location_id(app: AppHandle) -> Result<Option<String>, String> {
    Ok(load_config(&app)?.map(|c| c.location_id))
}

#[tauri::command]
pub fn ghl_set_credentials(
    app: AppHandle,
    private_token: String,
    location_id: String,
) -> Result<(), String> {
    let token = private_token.trim().to_string();
    let loc = location_id.trim().to_string();
    if token.is_empty() || loc.is_empty() {
        return Err("Both token and location ID are required.".into());
    }
    // Preserve any previously chosen pipeline IDs + booking calendar so the
    // user doesn't have to re-pick when rotating the token.
    let existing = load_config(&app).ok().flatten();
    save_config(
        &app,
        &GhlConfig {
            private_token: token,
            location_id: loc,
            sales_pipeline_id: existing.as_ref().and_then(|c| c.sales_pipeline_id.clone()),
            onboarding_pipeline_id: existing
                .as_ref()
                .and_then(|c| c.onboarding_pipeline_id.clone()),
            booking_calendar_id: existing
                .as_ref()
                .and_then(|c| c.booking_calendar_id.clone()),
        },
    )
}

#[tauri::command]
pub fn ghl_get_config_status(app: AppHandle) -> Result<GhlConfigStatus, String> {
    match load_config(&app)? {
        Some(c) => Ok(GhlConfigStatus {
            configured: true,
            location_id: Some(c.location_id),
            sales_pipeline_id: c.sales_pipeline_id,
            onboarding_pipeline_id: c.onboarding_pipeline_id,
            booking_calendar_id: c.booking_calendar_id,
        }),
        None => Ok(GhlConfigStatus::default()),
    }
}

#[tauri::command]
pub fn ghl_set_pipeline_choice(
    app: AppHandle,
    hub: String,
    pipeline_id: Option<String>,
) -> Result<(), String> {
    let mut cfg = require_config(&app)?;
    let normalized = pipeline_id.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    match hub.as_str() {
        "sales" => cfg.sales_pipeline_id = normalized,
        "onboarding" => cfg.onboarding_pipeline_id = normalized,
        other => return Err(format!("Unknown hub '{other}' — expected 'sales' or 'onboarding'.")),
    }
    save_config(&app, &cfg)
}

#[tauri::command]
pub fn ghl_set_booking_calendar(
    app: AppHandle,
    calendar_id: Option<String>,
) -> Result<(), String> {
    let mut cfg = require_config(&app)?;
    cfg.booking_calendar_id = calendar_id.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    save_config(&app, &cfg)
}

#[tauri::command]
pub fn ghl_clear_credentials(app: AppHandle) -> Result<(), String> {
    let p = config_path(&app)?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("delete ghl config: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ghl_list_pipelines(app: AppHandle) -> Result<Vec<GhlPipeline>, String> {
    let cfg = require_config(&app)?;
    let v = ghl_get(
        &cfg.private_token,
        "/opportunities/pipelines",
        &[("locationId", &cfg.location_id)],
    )
    .await?;
    let arr = v
        .get("pipelines")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for p in arr {
        let id = p.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let name = p.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let stages = p
            .get("stages")
            .and_then(|s| s.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|s| GhlStage {
                        id: s.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        name: s.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                        position: s.get("position").and_then(|x| x.as_i64()).unwrap_or(0),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        out.push(GhlPipeline { id, name, stages });
    }
    Ok(out)
}

#[tauri::command]
pub async fn ghl_list_calendars(app: AppHandle) -> Result<Vec<GhlCalendar>, String> {
    let cfg = require_config(&app)?;
    let v = ghl_get(
        &cfg.private_token,
        "/calendars/",
        &[("locationId", cfg.location_id.as_str())],
    )
    .await?;
    let arr = v
        .get("calendars")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for c in arr {
        let id = c.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let name = c
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("(unnamed calendar)")
            .to_string();
        let is_active = c.get("isActive").and_then(|x| x.as_bool());
        let calendar_type = c
            .get("calendarType")
            .and_then(|x| x.as_str())
            .map(String::from);
        out.push(GhlCalendar {
            id,
            name,
            is_active,
            calendar_type,
        });
    }
    Ok(out)
}

/// Fetch appointments for a calendar in the given ISO window. GHL's events
/// endpoint expects unix-millisecond ints for `startTime` / `endTime`, so we
/// convert at the boundary. The returned shape is normalized to ISO strings
/// for downstream code.
#[tauri::command]
pub async fn ghl_list_appointments(
    app: AppHandle,
    calendar_id: String,
    start_iso: String,
    end_iso: String,
) -> Result<Vec<GhlAppointment>, String> {
    let cfg = require_config(&app)?;
    let start_ms = iso_to_unix_ms(&start_iso)?;
    let end_ms = iso_to_unix_ms(&end_iso)?;
    let start_s = start_ms.to_string();
    let end_s = end_ms.to_string();
    let v = ghl_get(
        &cfg.private_token,
        "/calendars/events",
        &[
            ("locationId", cfg.location_id.as_str()),
            ("calendarId", calendar_id.as_str()),
            ("startTime", start_s.as_str()),
            ("endTime", end_s.as_str()),
        ],
    )
    .await?;
    let arr = v
        .get("events")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for e in arr {
        let id = e.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let cal = e
            .get("calendarId")
            .and_then(|x| x.as_str())
            .unwrap_or(calendar_id.as_str())
            .to_string();
        let status = e
            .get("appointmentStatus")
            .and_then(|x| x.as_str())
            .unwrap_or("confirmed")
            .to_string();
        // `startTime` / `endTime` are ISO-8601 strings on this v2 endpoint.
        let start_iso = e
            .get("startTime")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let end_iso = e
            .get("endTime")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if start_iso.is_empty() || end_iso.is_empty() {
            continue;
        }
        let title = e.get("title").and_then(|x| x.as_str()).map(String::from);
        let contact_id = e
            .get("contactId")
            .and_then(|x| x.as_str())
            .map(String::from)
            .or_else(|| {
                e.get("contact")
                    .and_then(|c| c.get("id"))
                    .and_then(|x| x.as_str())
                    .map(String::from)
            });
        // Most v2 responses don't inline contact name/email — caller falls
        // back to looking the contact up by id when it's missing. We still
        // pull whatever's available to skip the extra request when we can.
        let contact_name = e
            .get("contact")
            .and_then(|c| c.get("name"))
            .and_then(|x| x.as_str())
            .map(String::from);
        let contact_email = e
            .get("contact")
            .and_then(|c| c.get("email"))
            .and_then(|x| x.as_str())
            .map(String::from);
        let date_updated = e
            .get("dateUpdated")
            .and_then(|x| x.as_str())
            .map(String::from);
        out.push(GhlAppointment {
            id,
            calendar_id: cal,
            appointment_status: status,
            start_iso,
            end_iso,
            title,
            contact_id,
            contact_name,
            contact_email,
            date_updated,
        });
    }
    Ok(out)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhlContactLite {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
}

/// Look up a contact by GHL id. Used by the calendar-sync orchestrator when
/// an appointment payload doesn't inline contact details.
#[tauri::command]
pub async fn ghl_get_contact(
    app: AppHandle,
    contact_id: String,
) -> Result<GhlContactLite, String> {
    let cfg = require_config(&app)?;
    let path = format!("/contacts/{contact_id}");
    let v = ghl_get(&cfg.private_token, &path, &[]).await?;
    let c = v.get("contact").ok_or_else(|| "no contact field".to_string())?;
    Ok(GhlContactLite {
        id: c
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or(&contact_id)
            .to_string(),
        name: c.get("contactName").and_then(|x| x.as_str()).map(String::from),
        first_name: c.get("firstName").and_then(|x| x.as_str()).map(String::from),
        last_name: c.get("lastName").and_then(|x| x.as_str()).map(String::from),
        email: c.get("email").and_then(|x| x.as_str()).map(String::from),
        phone: c.get("phone").and_then(|x| x.as_str()).map(String::from),
    })
}

fn iso_to_unix_ms(iso: &str) -> Result<i64, String> {
    let parsed = chrono::DateTime::parse_from_rfc3339(iso)
        .map_err(|e| format!("invalid RFC3339 timestamp '{iso}': {e}"))?;
    Ok(parsed.timestamp_millis())
}

#[tauri::command]
pub async fn ghl_list_opportunities(
    app: AppHandle,
    pipeline_id: String,
) -> Result<Vec<GhlOpportunity>, String> {
    let cfg = require_config(&app)?;
    let v = ghl_get(
        &cfg.private_token,
        "/opportunities/search",
        &[
            ("location_id", cfg.location_id.as_str()),
            ("pipeline_id", pipeline_id.as_str()),
            ("limit", "100"),
        ],
    )
    .await?;
    let arr = v
        .get("opportunities")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for o in arr {
        let id = o.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let name = o.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
        // Contact can live at `contact` or `contactId` depending on the endpoint shape.
        let (contact_id, contact_name, contact_email) =
            if let Some(c) = o.get("contact").and_then(|v| v.as_object()) {
                (
                    c.get("id").and_then(|x| x.as_str()).map(String::from),
                    c.get("name").and_then(|x| x.as_str()).map(String::from),
                    c.get("email").and_then(|x| x.as_str()).map(String::from),
                )
            } else {
                (
                    o.get("contactId").and_then(|x| x.as_str()).map(String::from),
                    None,
                    None,
                )
            };
        out.push(GhlOpportunity {
            id,
            name,
            contact_id,
            contact_name,
            contact_email,
            pipeline_id: o
                .get("pipelineId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            pipeline_stage_id: o
                .get("pipelineStageId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            status: o.get("status").and_then(|x| x.as_str()).map(String::from),
            monetary_value: o.get("monetaryValue").and_then(|x| x.as_f64()),
            updated_at: o.get("updatedAt").and_then(|x| x.as_str()).map(String::from),
        });
    }
    Ok(out)
}

// ── upsert contact + opportunity + advance stage ──────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceArgs {
    /// Display name for the contact + opportunity (usually the client business name).
    pub client_name: String,
    /// Optional email — improves contact dedupe on the GHL side.
    #[serde(default)]
    pub client_email: Option<String>,
    /// Pipeline to target. Either pass `pipeline_id` (preferred — no lookup,
    /// no ambiguity) or `pipeline_name` (falls back to the first pipeline
    /// matching the name).
    #[serde(default)]
    pub pipeline_id: Option<String>,
    #[serde(default)]
    pub pipeline_name: Option<String>,
    /// Name of the stage to advance to (e.g. "Technical Setup").
    pub stage_name: String,
    /// Optional pre-known IDs from prior syncs — used as fast-path to avoid lookups.
    #[serde(default)]
    pub known_contact_id: Option<String>,
    #[serde(default)]
    pub known_opportunity_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceResult {
    pub contact_id: String,
    pub opportunity_id: String,
    pub pipeline_id: String,
    pub stage_id: String,
}

async fn resolve_pipeline_and_stage(
    token: &str,
    location_id: &str,
    pipeline_id: Option<&str>,
    pipeline_name: Option<&str>,
    stage_name: &str,
) -> Result<(String, String), String> {
    let v = ghl_get(
        token,
        "/opportunities/pipelines",
        &[("locationId", location_id)],
    )
    .await?;
    let pipelines = v
        .get("pipelines")
        .and_then(|p| p.as_array())
        .ok_or_else(|| "no pipelines field in response".to_string())?;
    let p = if let Some(pid) = pipeline_id {
        pipelines
            .iter()
            .find(|p| p.get("id").and_then(|x| x.as_str()) == Some(pid))
            .ok_or_else(|| format!("pipeline id '{pid}' not found in GHL"))?
    } else if let Some(pname) = pipeline_name {
        pipelines
            .iter()
            .find(|p| {
                p.get("name")
                    .and_then(|x| x.as_str())
                    .map(|n| n.eq_ignore_ascii_case(pname))
                    .unwrap_or(false)
            })
            .ok_or_else(|| format!("pipeline '{pname}' not found in GHL"))?
    } else {
        return Err("Either pipeline_id or pipeline_name is required.".to_string());
    };
    let resolved_id = p
        .get("id")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "pipeline has no id".to_string())?
        .to_string();
    let stage = p
        .get("stages")
        .and_then(|s| s.as_array())
        .and_then(|arr| {
            arr.iter().find(|s| {
                s.get("name")
                    .and_then(|x| x.as_str())
                    .map(|n| n.eq_ignore_ascii_case(stage_name))
                    .unwrap_or(false)
            })
        })
        .ok_or_else(|| {
            let pipeline_label = p
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("(unknown)");
            format!("stage '{stage_name}' not found in pipeline '{pipeline_label}'")
        })?;
    let stage_id = stage
        .get("id")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "stage has no id".to_string())?
        .to_string();
    Ok((resolved_id, stage_id))
}

async fn find_contact_by_email(
    token: &str,
    location_id: &str,
    email: &str,
) -> Result<Option<String>, String> {
    let v = ghl_post(
        token,
        "/contacts/search",
        &json!({
            "locationId": location_id,
            "filters": [{ "field": "email", "operator": "eq", "value": email }],
            "pageLimit": 1
        }),
    )
    .await?;
    Ok(v.get("contacts")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("id"))
        .and_then(|x| x.as_str())
        .map(String::from))
}

async fn create_contact(
    token: &str,
    location_id: &str,
    name: &str,
    email: Option<&str>,
) -> Result<String, String> {
    let (first, last) = match name.split_once(' ') {
        Some((f, l)) => (f.to_string(), l.to_string()),
        None => (name.to_string(), String::new()),
    };
    let mut body = json!({
        "locationId": location_id,
        "firstName": first,
        "lastName": last,
        "name": name,
        "source": "Hauck Marketing Lab",
    });
    if let Some(e) = email {
        body["email"] = json!(e);
    }
    let v = ghl_post(token, "/contacts/", &body).await?;
    v.get("contact")
        .and_then(|c| c.get("id"))
        .and_then(|x| x.as_str())
        .map(String::from)
        .ok_or_else(|| "create contact: no id in response".to_string())
}

async fn find_opportunity_by_contact_pipeline(
    token: &str,
    location_id: &str,
    pipeline_id: &str,
    contact_id: &str,
) -> Result<Option<(String, String)>, String> {
    let v = ghl_get(
        token,
        "/opportunities/search",
        &[
            ("location_id", location_id),
            ("pipeline_id", pipeline_id),
            ("contact_id", contact_id),
            ("limit", "1"),
        ],
    )
    .await?;
    if let Some(arr) = v.get("opportunities").and_then(|a| a.as_array()) {
        if let Some(o) = arr.first() {
            let id = o.get("id").and_then(|x| x.as_str()).map(String::from);
            let stage = o
                .get("pipelineStageId")
                .and_then(|x| x.as_str())
                .map(String::from);
            if let (Some(id), Some(stage)) = (id, stage) {
                return Ok(Some((id, stage)));
            }
        }
    }
    Ok(None)
}

async fn create_opportunity(
    token: &str,
    location_id: &str,
    name: &str,
    contact_id: &str,
    pipeline_id: &str,
    stage_id: &str,
) -> Result<String, String> {
    let body = json!({
        "locationId": location_id,
        "pipelineId": pipeline_id,
        "pipelineStageId": stage_id,
        "name": name,
        "status": "open",
        "contactId": contact_id,
    });
    let v = ghl_post(token, "/opportunities/", &body).await?;
    v.get("opportunity")
        .and_then(|o| o.get("id"))
        .and_then(|x| x.as_str())
        .map(String::from)
        .ok_or_else(|| "create opportunity: no id in response".to_string())
}

async fn move_opportunity(
    token: &str,
    opportunity_id: &str,
    stage_id: &str,
) -> Result<(), String> {
    let path = format!("/opportunities/{}", opportunity_id);
    let body = json!({ "pipelineStageId": stage_id });
    ghl_put(token, &path, &body).await.map(|_| ())
}

#[tauri::command]
pub async fn ghl_advance_opportunity(
    app: AppHandle,
    args: AdvanceArgs,
) -> Result<AdvanceResult, String> {
    let cfg = require_config(&app)?;
    let token = cfg.private_token.as_str();
    let loc = cfg.location_id.as_str();

    let (pipeline_id, stage_id) = resolve_pipeline_and_stage(
        token,
        loc,
        args.pipeline_id.as_deref(),
        args.pipeline_name.as_deref(),
        &args.stage_name,
    )
    .await?;

    // 1. Contact: prefer known, else lookup by email, else create.
    let contact_id = match args.known_contact_id {
        Some(id) if !id.is_empty() => id,
        _ => {
            let email_lookup = match args.client_email.as_deref() {
                Some(e) if !e.trim().is_empty() => {
                    find_contact_by_email(token, loc, e.trim()).await?
                }
                _ => None,
            };
            match email_lookup {
                Some(id) => id,
                None => create_contact(token, loc, &args.client_name, args.client_email.as_deref()).await?,
            }
        }
    };

    // 2. Opportunity: prefer known, else lookup, else create.
    let opp_id = match args.known_opportunity_id {
        Some(id) if !id.is_empty() => {
            move_opportunity(token, &id, &stage_id).await?;
            id
        }
        _ => {
            match find_opportunity_by_contact_pipeline(token, loc, &pipeline_id, &contact_id)
                .await?
            {
                Some((id, current_stage)) => {
                    if current_stage != stage_id {
                        move_opportunity(token, &id, &stage_id).await?;
                    }
                    id
                }
                None => {
                    create_opportunity(
                        token,
                        loc,
                        &args.client_name,
                        &contact_id,
                        &pipeline_id,
                        &stage_id,
                    )
                    .await?
                }
            }
        }
    };

    Ok(AdvanceResult {
        contact_id,
        opportunity_id: opp_id,
        pipeline_id,
        stage_id,
    })
}
