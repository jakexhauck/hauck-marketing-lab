//! Personal Hub — `vault/personal.json`.
//!
//! Single JSON file with two sections (`hygiene`, `clothing`). Each section
//! has a list of categories; each category has a list of items with optional
//! URL and numeric price. Prices are numbers so the frontend can total each
//! category. The file syncs to other machines through the standard git sync.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersonalItem {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersonalCategory {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<PersonalItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonalSectionData {
    #[serde(default)]
    pub categories: Vec<PersonalCategory>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonalHubFile {
    #[serde(default)]
    pub hygiene: PersonalSectionData,
    #[serde(default)]
    pub clothing: PersonalSectionData,
}

fn personal_path(root: &str) -> PathBuf {
    vault_root(root).join("personal.json")
}

fn write_atomic(path: &std::path::Path, body: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("create personal dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| format!("write tmp '{}': {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename personal file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_personal_hub(root: String) -> Result<PersonalHubFile, String> {
    let path = personal_path(&root);
    if !path.exists() {
        return Ok(PersonalHubFile::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read personal: {e}"))?;
    let file: PersonalHubFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse personal: {e}"))?;
    Ok(file)
}

#[tauri::command]
pub fn write_personal_hub(
    app: AppHandle,
    root: String,
    file: PersonalHubFile,
) -> Result<(), String> {
    let path = personal_path(&root);
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| format!("serialize personal: {e}"))?;
    write_atomic(&path, &json)?;
    emit_changed(
        &app,
        DataKind::Vault,
        None,
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}
