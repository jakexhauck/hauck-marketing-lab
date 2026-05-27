//! Per-conversation sheet-page selection for the copywriter chat.
//!
//! Each conversation (chat file) can choose which tabs of the client's linked
//! Google Sheet the copywriter may read, on top of the client-wide research
//! tab. Stored as a sidecar map { chat-file-path: [tab titles] } so the choice
//! survives reopening the conversation, without changing the chat-file format
//! (which other code reads/writes).

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

fn store_path(root: &str) -> PathBuf {
    PathBuf::from(root).join("chat-sheet-tabs.json")
}

fn read_all(root: &str) -> BTreeMap<String, Vec<String>> {
    let path = store_path(root);
    if !path.exists() {
        return BTreeMap::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// The tabs a given conversation may read. Empty if none chosen.
#[tauri::command]
pub fn read_chat_sheet_tabs(root: String, chat_path: String) -> Result<Vec<String>, String> {
    Ok(read_all(&root).get(&chat_path).cloned().unwrap_or_default())
}

/// Replace the tab selection for a conversation. Empty list clears the entry.
#[tauri::command]
pub fn write_chat_sheet_tabs(
    root: String,
    chat_path: String,
    tabs: Vec<String>,
) -> Result<(), String> {
    let mut all = read_all(&root);
    if tabs.is_empty() {
        all.remove(&chat_path);
    } else {
        all.insert(chat_path, tabs);
    }
    let json = serde_json::to_string_pretty(&all)
        .map_err(|e| format!("serialize chat sheet tabs: {e}"))?;
    fs::write(store_path(&root), json).map_err(|e| format!("write chat sheet tabs: {e}"))?;
    Ok(())
}
