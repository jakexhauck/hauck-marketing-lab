use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum TrackingStatus {
    Ok,
    Warning,
    Missing,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackingAudit {
    pub client: String,
    pub pixel_status: TrackingStatus,
    pub capi_status: TrackingStatus,
    #[serde(default)]
    pub emq_score: Option<f64>,
    #[serde(default)]
    pub pulse_note: Option<String>,
    pub updated_at: String,
}

fn tracking_path(root: &str, client_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("data")
        .join(client_slug)
        .join("tracking.yaml")
}

#[tauri::command]
pub fn read_tracking_audit(
    root: String,
    client_slug: String,
) -> Result<Option<TrackingAudit>, String> {
    let path = tracking_path(&root, &client_slug);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read tracking: {e}"))?;
    let audit: TrackingAudit =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse tracking: {e}"))?;
    Ok(Some(audit))
}

#[tauri::command]
pub fn write_tracking_audit(
    root: String,
    client_slug: String,
    audit: TrackingAudit,
) -> Result<String, String> {
    let path = tracking_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let stamped = TrackingAudit {
        client: audit.client,
        pixel_status: audit.pixel_status,
        capi_status: audit.capi_status,
        emq_score: audit.emq_score,
        pulse_note: audit.pulse_note,
        updated_at: Utc::now().to_rfc3339(),
    };
    let yaml = serde_yaml::to_string(&stamped).map_err(|e| format!("serialize tracking: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write tracking: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}
