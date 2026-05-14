//! Workspace > Dashboard "Ops" trackers.
//!
//! Three JSON files live side-by-side in `<vault>/ops/`:
//!   * clients.json   — per-client retainer / ad-spend / next-call columns,
//!                      keyed by client slug and joined with the live client
//!                      list at render time.
//!   * tasks.json     — task tracker rows.
//!   * revenue.json   — monthly revenue + expenses rows. Derived fields
//!                      (net profit, # of clients, revenue per client) are
//!                      computed on the frontend.
//!
//! Writes are atomic (tmp + rename) and emit a `data://changed` event so
//! anything else listening can refresh.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

// ── types ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpsClientRow {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retainer: Option<f64>,
    /// Retainer / contract start date (when the money started). Distinct from
    /// `ads_launched_at` — onboarding can run for days/weeks before ads go live.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ad_spend: Option<f64>,
    /// Date the campaigns actually went live. Drives weekly + monthly report
    /// cadence. Stamped by onboarding when task `06-publish` is checked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ads_launched_at: Option<String>,
    /// Legacy single-due-date column. New code computes weekly + monthly from
    /// `ads_launched_at` and the *_sent_at fields below. Kept on the struct so
    /// existing on-disk rows still round-trip.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_report_due: Option<String>,
    /// ISO date the most-recent weekly report was marked sent. Used to advance
    /// the displayed weekly due date by one cadence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weekly_report_sent_at: Option<String>,
    /// ISO date the most-recent monthly report was marked sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monthly_report_sent_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_call: Option<String>,
    /// GCal event id when the next call was sourced from the calendar. Null
    /// when the date was typed in manually from the row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_call_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpsClientsFile {
    /// Keyed by client slug. BTreeMap so the on-disk JSON has a stable order.
    #[serde(default)]
    pub rows: BTreeMap<String, OpsClientRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpsTask {
    pub id: String,
    pub title: String,
    /// `null` means agency-internal task (not tied to a client).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    /// "todo" | "in-progress" | "done"
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpsTasksFile {
    #[serde(default)]
    pub tasks: Vec<OpsTask>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpsRevenueRow {
    /// ISO `YYYY-MM` month identifier.
    pub month: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revenue: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expenses: Option<f64>,
    /// Manual override for # of clients that month. When `None`, the
    /// frontend falls back to "count of active clients today".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clients_override: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpsRevenueFile {
    #[serde(default)]
    pub months: Vec<OpsRevenueRow>,
}

// ── paths ──────────────────────────────────────────────────

fn ops_dir(root: &str) -> PathBuf {
    vault_root(root).join("ops")
}

fn clients_path(root: &str) -> PathBuf {
    ops_dir(root).join("clients.json")
}

fn tasks_path(root: &str) -> PathBuf {
    ops_dir(root).join("tasks.json")
}

fn revenue_path(root: &str) -> PathBuf {
    ops_dir(root).join("revenue.json")
}

fn write_atomic(path: &std::path::Path, body: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("create ops dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write tmp '{}': {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename ops file: {e}"))?;
    Ok(())
}

// ── clients.json ────────────────────────────────────────────

#[tauri::command]
pub fn read_ops_clients(root: String) -> Result<OpsClientsFile, String> {
    let path = clients_path(&root);
    if !path.exists() {
        return Ok(OpsClientsFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read ops clients: {e}"))?;
    let file: OpsClientsFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse ops clients: {e}"))?;
    Ok(file)
}

#[tauri::command]
pub fn write_ops_clients(
    app: AppHandle,
    root: String,
    file: OpsClientsFile,
) -> Result<(), String> {
    let path = clients_path(&root);
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| format!("serialize ops clients: {e}"))?;
    write_atomic(&path, &json)?;
    emit_changed(
        &app,
        DataKind::DashboardState,
        None,
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}

// ── tasks.json ─────────────────────────────────────────────

#[tauri::command]
pub fn read_ops_tasks(root: String) -> Result<OpsTasksFile, String> {
    let path = tasks_path(&root);
    if !path.exists() {
        return Ok(OpsTasksFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read ops tasks: {e}"))?;
    let file: OpsTasksFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse ops tasks: {e}"))?;
    Ok(file)
}

#[tauri::command]
pub fn write_ops_tasks(app: AppHandle, root: String, file: OpsTasksFile) -> Result<(), String> {
    let path = tasks_path(&root);
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| format!("serialize ops tasks: {e}"))?;
    write_atomic(&path, &json)?;
    emit_changed(
        &app,
        DataKind::DashboardState,
        None,
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}

// ── revenue.json ───────────────────────────────────────────

#[tauri::command]
pub fn read_ops_revenue(root: String) -> Result<OpsRevenueFile, String> {
    let path = revenue_path(&root);
    if !path.exists() {
        return Ok(OpsRevenueFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read ops revenue: {e}"))?;
    let file: OpsRevenueFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse ops revenue: {e}"))?;
    Ok(file)
}

#[tauri::command]
pub fn write_ops_revenue(
    app: AppHandle,
    root: String,
    file: OpsRevenueFile,
) -> Result<(), String> {
    let path = revenue_path(&root);
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| format!("serialize ops revenue: {e}"))?;
    write_atomic(&path, &json)?;
    emit_changed(
        &app,
        DataKind::DashboardState,
        None,
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}
