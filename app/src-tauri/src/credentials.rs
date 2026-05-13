// Per-client Meta credentials storage.
//
// TRUST MODEL — file-based, NOT encrypted (v1 deal):
//   Tokens live in plain YAML at `data/<slug>/credentials.yaml`. Anyone with
//   read access to the folder can read the token. The file is gitignored.
//   A keychain-backed variant (tauri-plugin-stronghold or tauri-plugin-keyring)
//   is listed as a follow-up backlog item; we explicitly chose the simpler
//   file-based approach for v1 so the user has a single, portable folder
//   that holds everything about a client.
//
// All four `meta.*` fields are individually optional. The user may save just
// the access token and fill the rest in later.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MetaCredentials {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ad_account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pixel_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClientCredentialsFile {
    #[serde(default)]
    pub client: String,
    #[serde(default)]
    pub meta: MetaCredentials,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

fn credentials_path(root: &str, client_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("data")
        .join(client_slug)
        .join("credentials.yaml")
}

#[tauri::command]
pub fn read_client_credentials(
    root: String,
    client_slug: String,
) -> Result<ClientCredentialsFile, String> {
    let path = credentials_path(&root, &client_slug);
    if !path.exists() {
        return Ok(ClientCredentialsFile {
            client: client_slug,
            meta: MetaCredentials::default(),
            updated_at: None,
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read credentials: {e}"))?;
    let mut file: ClientCredentialsFile =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse credentials: {e}"))?;
    // ensure client field is populated even on hand-edited files
    if file.client.is_empty() {
        file.client = client_slug;
    }
    Ok(file)
}

#[tauri::command]
pub fn write_client_credentials(
    root: String,
    client_slug: String,
    file: ClientCredentialsFile,
) -> Result<(), String> {
    let path = credentials_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    // Normalize empty-string fields to None so the YAML stays tidy.
    let trim_opt = |v: Option<String>| -> Option<String> {
        v.and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() { None } else { Some(t) }
        })
    };
    let stamped = ClientCredentialsFile {
        client: client_slug,
        meta: MetaCredentials {
            access_token: trim_opt(file.meta.access_token),
            ad_account_id: trim_opt(file.meta.ad_account_id),
            pixel_id: trim_opt(file.meta.pixel_id),
            business_id: trim_opt(file.meta.business_id),
        },
        updated_at: Some(Utc::now().to_rfc3339()),
    };
    let yaml =
        serde_yaml::to_string(&stamped).map_err(|e| format!("serialize credentials: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write credentials: {e}"))
}

#[tauri::command]
pub fn clear_client_credentials(root: String, client_slug: String) -> Result<(), String> {
    let path = credentials_path(&root, &client_slug);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete credentials: {e}"))?;
    }
    Ok(())
}
