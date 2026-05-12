use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub notes: Vec<Note>,
    #[serde(default)]
    pub calendar: Option<CalendarConnection>,
    #[serde(default)]
    pub recordings: Vec<FathomRecording>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub done: bool,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FathomRecording {
    pub id: String,
    pub url: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalendarConnection {
    pub api_key: String,
    pub calendar_id: String,
    #[serde(default)]
    pub label: Option<String>,
    pub connected_at: String,
}

fn dashboard_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join(".hml")
}

fn dashboard_path(root: &str) -> PathBuf {
    dashboard_dir(root).join("dashboard.json")
}

#[tauri::command]
pub fn read_dashboard_state(root: String) -> Result<DashboardState, String> {
    let path = dashboard_path(&root);
    if !path.exists() {
        return Ok(DashboardState::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read dashboard: {e}"))?;
    let state: DashboardState =
        serde_json::from_str(&raw).map_err(|e| format!("parse dashboard: {e}"))?;
    Ok(state)
}

#[tauri::command]
pub fn write_dashboard_state(
    app: AppHandle,
    root: String,
    state: DashboardState,
) -> Result<(), String> {
    let dir = dashboard_dir(&root);
    fs::create_dir_all(&dir).map_err(|e| format!("create dirs: {e}"))?;
    let final_path = dashboard_path(&root);
    let tmp_path = dir.join("dashboard.json.tmp");
    let json =
        serde_json::to_string_pretty(&state).map_err(|e| format!("serialize dashboard: {e}"))?;
    fs::write(&tmp_path, json).map_err(|e| format!("write dashboard tmp: {e}"))?;
    fs::rename(&tmp_path, &final_path).map_err(|e| format!("rename dashboard: {e}"))?;
    let path_str = final_path.to_string_lossy().into_owned();
    emit_changed(&app, DataKind::DashboardState, None, Some(path_str));
    Ok(())
}
