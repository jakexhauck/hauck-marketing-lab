//! Global saved-prompt templates for the skill chats.
//!
//! These are copy-paste snippets the user keeps next to the chat (the "Prompts"
//! tab in the right rail). They are universal: shared across every client and
//! every skill chat, and never sent automatically. Stored as one JSON file at
//! the root so they ride along with the synced repo.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedPrompt {
    pub id: String,
    pub title: String,
    pub body: String,
}

fn prompts_path(root: &str) -> PathBuf {
    PathBuf::from(root).join("saved-prompts.json")
}

#[tauri::command]
pub fn list_saved_prompts(root: String) -> Result<Vec<SavedPrompt>, String> {
    let path = prompts_path(&root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read saved prompts: {e}"))?;
    let prompts: Vec<SavedPrompt> =
        serde_json::from_str(&raw).map_err(|e| format!("parse saved prompts: {e}"))?;
    Ok(prompts)
}

/// Persist the full list (the frontend manages add/edit/delete then saves the
/// whole array). Keeps the backend trivial.
#[tauri::command]
pub fn save_saved_prompts(root: String, prompts: Vec<SavedPrompt>) -> Result<(), String> {
    let path = prompts_path(&root);
    let json =
        serde_json::to_string_pretty(&prompts).map_err(|e| format!("serialize saved prompts: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("write saved prompts: {e}"))?;
    Ok(())
}
