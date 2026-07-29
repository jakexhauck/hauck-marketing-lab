use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum CreativeSignal {
    Go,
    Hold,
    Stop,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativeVariant {
    pub id: String,
    pub name: String,
    pub signal: CreativeSignal,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativesManifest {
    pub client: String,
    pub min_active: u32,
    pub creatives: Vec<CreativeVariant>,
    pub updated_at: String,
}

fn creatives_path(root: &str, client_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("data")
        .join(client_slug)
        .join("creatives.yaml")
}

#[tauri::command]
pub fn read_creatives_manifest(
    root: String,
    client_slug: String,
) -> Result<Option<CreativesManifest>, String> {
    let path = creatives_path(&root, &client_slug);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read creatives: {e}"))?;
    let manifest: CreativesManifest =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse creatives: {e}"))?;
    Ok(Some(manifest))
}

#[tauri::command]
pub fn write_creatives_manifest(
    app: AppHandle,
    root: String,
    client_slug: String,
    manifest: CreativesManifest,
) -> Result<String, String> {
    let path = creatives_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let stamped = CreativesManifest {
        client: manifest.client,
        min_active: manifest.min_active,
        creatives: manifest.creatives,
        updated_at: Utc::now().to_rfc3339(),
    };
    let yaml = serde_yaml::to_string(&stamped).map_err(|e| format!("serialize creatives: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write creatives: {e}"))?;
    let path_str = path.to_string_lossy().into_owned();
    emit_changed(
        &app,
        DataKind::Creatives,
        Some(client_slug),
        Some(path_str.clone()),
    );
    Ok(path_str)
}
