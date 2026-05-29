//! Per-chatbot saved-prompt templates for the skill chats.
//!
//! These are copy-paste snippets the user keeps next to the chat (the "Prompts"
//! tab in the right rail). They are scoped per chatbot by the agent slug
//! ("copywriter", "data-analyst", ...) so one persona's prompts never bleed
//! into another's. They are never sent automatically. Stored as one JSON file
//! at the root (a map of slug -> prompts) so they ride along with the synced
//! repo.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedPrompt {
    pub id: String,
    pub title: String,
    pub body: String,
}

/// Slug used to home the pre-scoping prompts. The legacy flat list was all
/// review / pain-point / website-analysis snippets, i.e. data-analyst work, so
/// that's where a one-time migration parks them.
const LEGACY_SLUG: &str = "data-analyst";

fn prompts_path(root: &str) -> PathBuf {
    PathBuf::from(root).join("saved-prompts.json")
}

/// Load the slug -> prompts map, tolerating the legacy flat-array format. A bare
/// array (the pre-scoping shape) is migrated onto [`LEGACY_SLUG`] so those
/// prompts survive the upgrade. A missing file is an empty map.
fn load_map(root: &str) -> Result<BTreeMap<String, Vec<SavedPrompt>>, String> {
    let path = prompts_path(root);
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read saved prompts: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(BTreeMap::new());
    }
    let value: Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse saved prompts: {e}"))?;
    match value {
        // New format: { "<slug>": [ {id,title,body}, ... ], ... }
        Value::Object(_) => serde_json::from_value(value)
            .map_err(|e| format!("parse saved prompts map: {e}")),
        // Legacy format: a bare array shared across every chat.
        Value::Array(_) => {
            let legacy: Vec<SavedPrompt> = serde_json::from_value(value)
                .map_err(|e| format!("parse legacy saved prompts: {e}"))?;
            let mut map = BTreeMap::new();
            if !legacy.is_empty() {
                map.insert(LEGACY_SLUG.to_string(), legacy);
            }
            Ok(map)
        }
        _ => Err("saved prompts file is neither an object nor an array".to_string()),
    }
}

#[tauri::command]
pub fn list_saved_prompts(root: String, slug: String) -> Result<Vec<SavedPrompt>, String> {
    let mut map = load_map(&root)?;
    Ok(map.remove(&slug).unwrap_or_default())
}

/// Persist one chatbot's full list (the frontend manages add/edit/delete then
/// saves the whole array). Other slugs in the file are preserved untouched.
#[tauri::command]
pub fn save_saved_prompts(
    root: String,
    slug: String,
    prompts: Vec<SavedPrompt>,
) -> Result<(), String> {
    let mut map = load_map(&root)?;
    if prompts.is_empty() {
        map.remove(&slug);
    } else {
        map.insert(slug, prompts);
    }
    let path = prompts_path(&root);
    let json =
        serde_json::to_string_pretty(&map).map_err(|e| format!("serialize saved prompts: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("write saved prompts: {e}"))?;
    Ok(())
}
