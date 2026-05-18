//! Workspace > activity log.
//!
//! One append-only JSON-Lines file at `<vault>/ops/activity.jsonl`. Every
//! durable event in the OS writes here: form runs, scraper runs, mockups,
//! outreach drafts/sends/replies, memory write-back, scheduled jobs.
//!
//! Dashboard's "Recent activity" panel + the bell icon both read from this
//! file. `<vault>/ops/activity_state.json` holds the `lastSeenAt` stamp used
//! to compute the bell's unread badge.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ts: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prospect_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hot: Option<bool>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub meta: BTreeMap<String, serde_json::Value>,
}

fn log_path(root: &str) -> PathBuf {
    vault_root(root).join("ops").join("activity.jsonl")
}

fn state_path(root: &str) -> PathBuf {
    vault_root(root).join("ops").join("activity_state.json")
}

#[tauri::command]
pub fn append_activity(
    app: AppHandle,
    root: String,
    event: ActivityEvent,
) -> Result<(), String> {
    let path = log_path(&root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ops: {e}"))?;
    }
    let mut ev = event;
    if ev.ts.is_none() {
        ev.ts = Some(Utc::now().to_rfc3339());
    }
    let line = serde_json::to_string(&ev).map_err(|e| format!("serialize: {e}"))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open log: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("write log: {e}"))?;

    emit_changed(
        &app,
        DataKind::Activity,
        ev.client_slug.clone(),
        Some(path.to_string_lossy().to_string()),
    );
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityTail {
    pub events: Vec<ActivityEvent>,
    pub total: usize,
}

#[tauri::command]
pub fn tail_activity(root: String, limit: usize) -> Result<ActivityTail, String> {
    let path = log_path(&root);
    if !path.exists() {
        return Ok(ActivityTail {
            events: vec![],
            total: 0,
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read log: {e}"))?;
    let lines: Vec<&str> = raw.lines().filter(|l| !l.trim().is_empty()).collect();
    let total = lines.len();
    let start = total.saturating_sub(limit);
    let events: Vec<ActivityEvent> = lines[start..]
        .iter()
        .rev()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    Ok(ActivityTail { events, total })
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen_at: Option<String>,
}

#[tauri::command]
pub fn read_activity_state(root: String) -> Result<ActivityState, String> {
    let p = state_path(&root);
    if !p.exists() {
        return Ok(ActivityState::default());
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read state: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse state: {e}"))
}

#[tauri::command]
pub fn mark_activity_seen(root: String) -> Result<(), String> {
    let p = state_path(&root);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ops: {e}"))?;
    }
    let state = ActivityState {
        last_seen_at: Some(Utc::now().to_rfc3339()),
    };
    let s = serde_json::to_string_pretty(&state).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, s).map_err(|e| format!("write state: {e}"))
}
