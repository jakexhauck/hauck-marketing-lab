use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppConfig {
    pub media_buying_path: Option<String>,
    #[serde(default)]
    pub active_client_slug: Option<String>,
    #[serde(default)]
    pub default_agent_slug: Option<String>,
    /// URL to the agency-wide Google Drive folder that holds SOP docs.
    /// When set, the SOPs page lists + reads docs from this folder via
    /// the Drive MCP tools (see sops.rs).
    #[serde(default)]
    pub sops_drive_folder_url: Option<String>,
    /// Google AI Studio API key. Required by the AD_CREATIVE form to call
    /// Nano Banana 2 (gemini-3-pro-image) for static ad generation. Lives
    /// in plaintext in the per-user app config file; never committed.
    #[serde(default)]
    pub gemini_api_key: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<AppConfig, String> {
    let p = config_path(&app)?;
    if !p.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("read config: {e}"))?;
    let cfg: AppConfig = serde_json::from_str(&raw).map_err(|e| format!("parse config: {e}"))?;
    Ok(cfg)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let p = config_path(&app)?;
    let raw = serde_json::to_string_pretty(&config).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, raw).map_err(|e| format!("write config: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn suggest_folder_candidates() -> Vec<String> {
    let mut out = Vec::new();
    if let Some(home) = dirs::home_dir() {
        let candidates = [
            home.join("Desktop").join("hauck-marketing-lab").join("media-buying"),
            home.join("Documents").join("hauck-marketing-lab").join("media-buying"),
            home.join("iCloud Drive").join("hauck-marketing-lab").join("media-buying"),
            home.join("OneDrive").join("hauck-marketing-lab").join("media-buying"),
            home.join("Dropbox").join("hauck-marketing-lab").join("media-buying"),
            home.join("hauck-marketing-lab").join("media-buying"),
        ];
        for c in candidates.iter() {
            if c.exists() && c.is_dir() {
                if let Some(s) = c.to_str() {
                    out.push(s.to_string());
                }
            }
        }
    }
    // sibling fallback: when the app runs from inside the project root
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let sib = parent.join("media-buying");
            if sib.exists() {
                if let Some(s) = sib.to_str() {
                    out.push(s.to_string());
                }
            }
        }
    }
    out
}
