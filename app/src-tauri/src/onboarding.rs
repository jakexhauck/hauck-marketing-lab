//! Per-client onboarding state.
//!
//! Backs the multi-phase OnboardingChecklist UI. State lives at
//! `vault/Clients/<Name>/onboarding.json` so it git-syncs with the rest of
//! the vault and follows the user across machines.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingState {
    /// IDs of completed tasks, ordered by completion.
    #[serde(default)]
    pub done: Vec<String>,
    /// Keyed by phase number (as string) → human-readable completion date.
    #[serde(default)]
    pub phase_done_at: BTreeMap<String, String>,
    #[serde(default)]
    pub updated_at: String,
    /// Media Buying Sequence state. Opaque to the backend; shape lives in
    /// app/src/lib/mediaBuyingSequence.ts. Kept as JSON so adding fields TS-side
    /// doesn't require a Rust change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sequence: Option<serde_json::Value>,
}

fn client_name_for(root: &str, slug: &str) -> String {
    match crate::clients::read_clients_file(root) {
        Ok(list) => list
            .into_iter()
            .find(|c| c.slug == slug)
            .map(|c| c.name)
            .unwrap_or_else(|| slug.to_string()),
        Err(_) => slug.to_string(),
    }
}

fn onboarding_path(root: &str, slug: &str) -> PathBuf {
    let name = client_name_for(root, slug);
    vault_root(root)
        .join("Clients")
        .join(&name)
        .join("onboarding.json")
}

#[tauri::command]
pub fn read_onboarding_state(
    root: String,
    client_slug: String,
) -> Result<OnboardingState, String> {
    let path = onboarding_path(&root, &client_slug);
    if !path.exists() {
        return Ok(OnboardingState::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read onboarding: {e}"))?;
    let state: OnboardingState =
        serde_json::from_str(&raw).map_err(|e| format!("parse onboarding: {e}"))?;
    Ok(state)
}

#[tauri::command]
pub fn write_onboarding_state(
    app: AppHandle,
    root: String,
    client_slug: String,
    state: OnboardingState,
) -> Result<(), String> {
    let path = onboarding_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create onboarding dir: {e}"))?;
    }
    let stamped = OnboardingState {
        done: state.done,
        phase_done_at: state.phase_done_at,
        updated_at: Utc::now().to_rfc3339(),
        sequence: state.sequence,
    };
    let json =
        serde_json::to_string_pretty(&stamped).map_err(|e| format!("serialize onboarding: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename onboarding: {e}"))?;
    emit_changed(
        &app,
        DataKind::Onboarding,
        Some(client_slug),
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}
