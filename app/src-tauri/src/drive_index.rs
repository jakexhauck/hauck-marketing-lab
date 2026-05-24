use crate::clients::read_clients_file;
use crate::events::{emit_changed, DataKind};
use crate::google_calendar::google_access_token;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveIndex {
    pub client: String,
    pub drive_folder_url: Option<String>,
    pub updated_at: String,
    pub body: String,
    pub path: String,
}

/// Drive index location. Canonical (v2): `vault/Clients/<Name>/_drive-index.md`.
/// Falls back to the legacy `media-buying/data/<slug>/_drive-index.md` when
/// the vault file does not yet exist, so the migration can be done safely at
/// any time. Writes go to the canonical vault location.
fn drive_index_path(root: &str, slug: &str) -> PathBuf {
    let vault = crate::vault::vault_root(root);
    let name = client_name_for(root, slug);
    let vault_path = vault.join("Clients").join(&name).join("_drive-index.md");
    if vault_path.exists() {
        return vault_path;
    }
    // Legacy: media-buying/data/<slug>/_drive-index.md
    let legacy = PathBuf::from(root)
        .join("data")
        .join(slug)
        .join("_drive-index.md");
    if legacy.exists() {
        return legacy;
    }
    // Neither exists — return the canonical path so reads can fail cleanly
    // and writes land in the right place.
    vault_path
}

fn drive_index_write_path(root: &str, slug: &str) -> PathBuf {
    let vault = crate::vault::vault_root(root);
    let name = client_name_for(root, slug);
    vault.join("Clients").join(&name).join("_drive-index.md")
}

fn client_name_for(root: &str, slug: &str) -> String {
    match read_clients_file(root) {
        Ok(list) => list
            .into_iter()
            .find(|c| c.slug == slug)
            .map(|c| c.name)
            .unwrap_or_else(|| slug.to_string()),
        Err(_) => slug.to_string(),
    }
}

#[tauri::command]
pub fn read_drive_index(root: String, client_slug: String) -> Result<Option<DriveIndex>, String> {
    let path = drive_index_path(&root, &client_slug);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read drive index: {e}"))?;

    // Parse minimal frontmatter: --- ... ---
    let (updated_at, drive_url, body) = if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            let fm = &rest[..end];
            let after = &rest[end + 5..];
            let mut updated = String::new();
            let mut url: Option<String> = None;
            for line in fm.lines() {
                if let Some(v) = line.strip_prefix("updated_at:") {
                    updated = v.trim().trim_matches('"').to_string();
                } else if let Some(v) = line.strip_prefix("drive_folder_url:") {
                    let t = v.trim().trim_matches('"').to_string();
                    if !t.is_empty() && t != "null" {
                        url = Some(t);
                    }
                }
            }
            (updated, url, after.to_string())
        } else {
            (String::new(), None, raw.clone())
        }
    } else {
        (String::new(), None, raw.clone())
    };

    Ok(Some(DriveIndex {
        client: client_slug,
        drive_folder_url: drive_url,
        updated_at,
        body,
        path: path.to_string_lossy().into_owned(),
    }))
}

/// Extract a bare Drive folder ID from a URL or pass-through if already an ID.
fn extract_folder_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(rest) = trimmed.split("/folders/").nth(1) {
        let id: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && trimmed.len() >= 20
    {
        return Some(trimmed.to_string());
    }
    None
}

#[derive(Deserialize)]
struct DriveFileRaw {
    id: String,
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    #[serde(default, rename = "webViewLink")]
    web_view_link: Option<String>,
}

#[derive(Deserialize)]
struct ListResp {
    files: Vec<DriveFileRaw>,
    #[serde(default, rename = "nextPageToken")]
    next_page_token: Option<String>,
}

/// List the immediate children (files + folders) of a folder. Direct REST.
async fn list_children(
    client: &reqwest::Client,
    token: &str,
    folder_id: &str,
) -> Result<Vec<DriveFileRaw>, String> {
    let q = format!("'{folder_id}' in parents and trashed = false");
    let mut out = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut req = client
            .get("https://www.googleapis.com/drive/v3/files")
            .bearer_auth(token)
            .query(&[
                ("q", q.as_str()),
                ("fields", "nextPageToken,files(id,name,mimeType,webViewLink)"),
                ("orderBy", "folder,name"),
                ("pageSize", "200"),
                ("supportsAllDrives", "true"),
                ("includeItemsFromAllDrives", "true"),
            ]);
        if let Some(pt) = page_token.as_deref() {
            req = req.query(&[("pageToken", pt)]);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("drive list request: {e}"))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("drive list body: {e}"))?;
        if !status.is_success() {
            if status.as_u16() == 401 {
                return Err(
                    "Google auth expired or missing drive.metadata.readonly scope. Reconnect Google in main Settings.".to_string()
                );
            }
            return Err(format!("drive list failed ({status}): {body}"));
        }
        let parsed: ListResp = serde_json::from_str(&body)
            .map_err(|e| format!("parse drive list JSON: {e}; body: {body}"))?;
        out.extend(parsed.files);
        match parsed.next_page_token {
            Some(t) if !t.is_empty() => page_token = Some(t),
            _ => break,
        }
    }
    Ok(out)
}

const FOLDER_MIME: &str = "application/vnd.google-apps.folder";

fn file_url_for(f: &DriveFileRaw) -> String {
    if let Some(link) = f.web_view_link.as_deref() {
        if !link.is_empty() {
            return link.to_string();
        }
    }
    if f.mime_type == FOLDER_MIME {
        format!("https://drive.google.com/drive/folders/{}", f.id)
    } else if f.mime_type.starts_with("application/vnd.google-apps.") {
        format!("https://docs.google.com/document/d/{}/edit", f.id)
    } else {
        format!("https://drive.google.com/file/d/{}/view", f.id)
    }
}

/// Recursively build the tree JSON for a folder.
/// Boxed because the future references itself.
fn build_tree<'a>(
    client: &'a reqwest::Client,
    token: &'a str,
    folder_id: &'a str,
    folder_name: &'a str,
    depth: u32,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>> {
    Box::pin(async move {
        const MAX_DEPTH: u32 = 8;
        let mut node = json!({
            "id": folder_id,
            "name": folder_name,
            "type": "folder",
            "children": []
        });

        if depth >= MAX_DEPTH {
            return Ok(node);
        }

        let children = list_children(client, token, folder_id).await?;
        let mut child_nodes: Vec<Value> = Vec::with_capacity(children.len());
        for c in &children {
            if c.mime_type == FOLDER_MIME {
                let sub = build_tree(client, token, &c.id, &c.name, depth + 1).await?;
                child_nodes.push(sub);
            } else {
                child_nodes.push(json!({
                    "id": c.id,
                    "name": c.name,
                    "type": "file",
                    "mimeType": c.mime_type,
                    "url": file_url_for(c),
                }));
            }
        }
        node["children"] = Value::Array(child_nodes);
        Ok(node)
    })
}

/// Build the markdown body for `_drive-index.md`. Same shape the old claude -p
/// path produced (subfolders table + `## Tree` JSON block), just without the
/// LLM-written context briefing.
fn build_index_body(client_name: &str, root_tree: &Value) -> String {
    let mut s = String::new();
    s.push_str(&format!("# {client_name} — Client Context\n\n"));

    s.push_str("## Subfolders\n\n");
    s.push_str("| Subfolder | Folder ID | Notes |\n");
    s.push_str("|---|---|---|\n");
    let mut subfolder_count = 0;
    if let Some(children) = root_tree.get("children").and_then(|v| v.as_array()) {
        for c in children {
            if c.get("type").and_then(|v| v.as_str()) == Some("folder") {
                let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("?");
                s.push_str(&format!("| {name} | `{id}` | |\n"));
                subfolder_count += 1;
            }
        }
    }
    if subfolder_count == 0 {
        s.push_str("| _(empty root)_ | `` | No subfolders found |\n");
    }
    s.push('\n');

    s.push_str("## Tree\n\n```json\n");
    s.push_str(
        &serde_json::to_string_pretty(root_tree)
            .unwrap_or_else(|_| "{}".to_string()),
    );
    s.push_str("\n```\n");
    s
}

#[tauri::command]
pub async fn refresh_drive_index(
    app: AppHandle,
    root: String,
    client_slug: String,
) -> Result<DriveIndex, String> {
    let clients = read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;

    let drive_url = client
        .drive_folder_url
        .clone()
        .ok_or_else(|| {
            "This client has no Google Drive folder URL. Set one on the client's Settings tab first.".to_string()
        })?;

    let folder_id = extract_folder_id(&drive_url)
        .ok_or_else(|| format!("Could not extract a Drive folder ID from: {drive_url:?}"))?;

    let token = google_access_token(&app).await?;
    let http = reqwest::Client::new();

    // Build the tree
    let tree = build_tree(&http, &token, &folder_id, &client.name, 0).await?;
    let body = build_index_body(&client.name, &tree);

    let updated_at = chrono::Utc::now().to_rfc3339();
    let frontmatter = format!(
        "---\nclient: {slug}\ndrive_folder_url: \"{url}\"\nupdated_at: \"{ts}\"\n---\n",
        slug = client_slug,
        url = drive_url,
        ts = updated_at,
    );
    let file_body = format!("{frontmatter}\n{body}\n");

    let path = drive_index_write_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create client dir: {e}"))?;
    }
    fs::write(&path, &file_body).map_err(|e| format!("write drive index: {e}"))?;

    let path_str = path.to_string_lossy().into_owned();
    emit_changed(
        &app,
        DataKind::Client,
        Some(client_slug.clone()),
        Some(path_str.clone()),
    );

    Ok(DriveIndex {
        client: client_slug,
        drive_folder_url: Some(drive_url),
        updated_at,
        body,
        path: path_str,
    })
}
