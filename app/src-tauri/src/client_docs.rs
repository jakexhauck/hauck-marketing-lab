//! Per-client document storage layer.
//!
//! Files live at `<root>/vault/Clients/<Client Name>/Docs/<slug>.md`. The
//! directory uses the human-readable client *name* (matching the existing
//! Obsidian vault layout), not the slug. The slug is the wire identifier.
//!
//! This file is the pure-Rust filesystem + frontmatter layer. It does NOT
//! talk to Google Drive. Drive-side push / pull / delete live in
//! `drive_upload.rs` and (eventually) `drive_api.rs`.

use chrono::Utc;
use rand::RngCore;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;

const ALLOWED_KINDS: &[&str] = &["ad-copy", "brief", "notes", "report", "other"];

// ---- Public shapes ---------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocSummary {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub client_slug: String,
    pub created_at: String,
    pub updated_at: String,
    pub synced_at: Option<String>,
    pub current_drive_url: Option<String>,
    pub current_drive_file_id: Option<String>,
    pub current_version: u32,
    pub is_dirty: bool,
    pub drive_folder_id: Option<String>,
    pub drive_folder_name: Option<String>,
    pub unswept_orphan_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientDoc {
    #[serde(flatten)]
    pub summary: DocSummary,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocPayload {
    pub title: String,
    pub kind: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub drive_folder_id: Option<String>,
    #[serde(default)]
    pub drive_folder_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocSummaryWithClient {
    #[serde(flatten)]
    pub summary: DocSummary,
    pub client_name: String,
}

// ---- On-disk frontmatter ---------------------------------------------------

/// Frontmatter is written in this exact field order. Do NOT use a HashMap;
/// the YAML on disk needs to be diff-friendly and predictable.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct DocFrontmatter {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) kind: String,
    pub(crate) client_slug: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    #[serde(default)]
    pub(crate) drive_folder_id: Option<String>,
    #[serde(default)]
    pub(crate) drive_folder_name: Option<String>,
    #[serde(default)]
    pub(crate) current_drive_file_id: Option<String>,
    #[serde(default)]
    pub(crate) current_drive_url: Option<String>,
    #[serde(default)]
    pub(crate) current_version: u32,
    #[serde(default)]
    pub(crate) synced_at: Option<String>,
    #[serde(default)]
    pub(crate) synced_content_hash: Option<String>,
    #[serde(default)]
    pub(crate) previous_versions: Vec<serde_yaml::Value>,
    #[serde(default)]
    pub(crate) unswept_orphans: Vec<serde_yaml::Value>,
}

// ---- Path resolution -------------------------------------------------------

fn client_name_for(root: &str, slug: &str) -> Result<String, String> {
    let clients = crate::clients::read_clients_file(root)?;
    clients
        .into_iter()
        .find(|c| c.slug == slug)
        .map(|c| c.name)
        .ok_or_else(|| format!("No client with slug '{slug}'."))
}

pub(crate) fn docs_dir(root: &str, slug: &str) -> Result<PathBuf, String> {
    let name = client_name_for(root, slug)?;
    Ok(vault_root(root).join("Clients").join(&name).join("Docs"))
}

fn doc_path(dir: &Path, slug: &str) -> PathBuf {
    dir.join(format!("{slug}.md"))
}

// ---- Helpers ---------------------------------------------------------------

fn reject_unsafe(field: &str, value: &str) -> Result<(), String> {
    if value.contains('/')
        || value.contains('\\')
        || value.contains("..")
        || value.contains('\0')
    {
        return Err(format!("Invalid {field}: contains a forbidden character."));
    }
    Ok(())
}

fn slugify_title(title: &str) -> String {
    let lowered = title.trim().to_lowercase();
    let re = Regex::new(r"[^a-z0-9]+").expect("static regex");
    let with_dashes = re.replace_all(&lowered, "-");
    let trimmed = with_dashes.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

fn dedupe_slug(dir: &Path, base: &str, ignore: Option<&str>) -> String {
    let candidate = format!("{base}.md");
    if !dir.join(&candidate).exists() || Some(base) == ignore {
        return base.to_string();
    }
    let mut n: usize = 2;
    loop {
        let candidate = format!("{base}-{n}");
        if !dir.join(format!("{candidate}.md")).exists() {
            return candidate;
        }
        n += 1;
        if n > 9999 {
            return format!("{base}-x");
        }
    }
}

fn short_suffix() -> String {
    // 6 chars from Crockford-ish base32 (no I, L, O, U to avoid lookalikes).
    const ALPHABET: &[u8] = b"abcdefghjkmnpqrstvwxyz23456789";
    let mut bytes = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|b| ALPHABET[(*b as usize) % ALPHABET.len()] as char)
        .collect()
}

fn new_doc_id() -> String {
    format!(
        "doc_{}_{}",
        Utc::now().format("%Y-%m-%d"),
        short_suffix()
    )
}

pub(crate) fn sha256_hex(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if ALLOWED_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!(
            "Invalid kind '{kind}'. Expected one of: ad-copy, brief, notes, report, other."
        ))
    }
}

fn is_dirty(body: &str, synced_hash: &Option<String>) -> bool {
    match synced_hash {
        None => !body.is_empty(),
        Some(h) => sha256_hex(body) != *h,
    }
}

pub(crate) fn build_summary(fm: &DocFrontmatter, body: &str) -> DocSummary {
    let unswept_count = fm.unswept_orphans.len() as u32;
    DocSummary {
        id: fm.id.clone(),
        title: fm.title.clone(),
        kind: fm.kind.clone(),
        client_slug: fm.client_slug.clone(),
        created_at: fm.created_at.clone(),
        updated_at: fm.updated_at.clone(),
        synced_at: fm.synced_at.clone(),
        current_drive_url: fm.current_drive_url.clone(),
        current_drive_file_id: fm.current_drive_file_id.clone(),
        current_version: fm.current_version,
        is_dirty: is_dirty(body, &fm.synced_content_hash),
        drive_folder_id: fm.drive_folder_id.clone(),
        drive_folder_name: fm.drive_folder_name.clone(),
        unswept_orphan_count: unswept_count,
    }
}

pub(crate) fn serialize_doc(fm: &DocFrontmatter, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(fm).map_err(|e| format!("serialize frontmatter: {e}"))?;
    let mut out = String::with_capacity(yaml.len() + body.len() + 16);
    out.push_str("---\n");
    out.push_str(&yaml);
    if !yaml.ends_with('\n') {
        out.push('\n');
    }
    out.push_str("---\n\n");
    out.push_str(body);
    if !body.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub(crate) fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create docs dir: {e}"))?;
    }
    let tmp = path.with_extension("md.tmp");
    fs::write(&tmp, contents).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename doc: {e}"))?;
    Ok(())
}

pub(crate) fn read_doc_file(path: &Path) -> Result<(DocFrontmatter, String), String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read doc: {e}"))?;
    let (yaml, body) = crate::frontmatter::split(&raw).ok_or_else(|| {
        format!(
            "Missing frontmatter in {}.",
            path.to_string_lossy()
        )
    })?;
    let fm: DocFrontmatter = serde_yaml::from_str(&yaml).map_err(|e| {
        format!(
            "Invalid frontmatter in {}: {e}",
            path.to_string_lossy()
        )
    })?;
    Ok((fm, body))
}

pub(crate) fn find_doc_path(dir: &Path, doc_id: &str) -> Result<PathBuf, String> {
    if !dir.exists() {
        return Err(format!("No doc with id '{doc_id}' for this client."));
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("read docs dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !file_name.ends_with(".md") || file_name.ends_with(".md.tmp") {
            continue;
        }
        match read_doc_file(&path) {
            Ok((fm, _)) if fm.id == doc_id => return Ok(path),
            _ => continue,
        }
    }
    Err(format!("No doc with id '{doc_id}' for this client."))
}

// ---- Commands --------------------------------------------------------------

#[tauri::command]
pub fn list_client_docs(root: String, client_slug: String) -> Result<Vec<DocSummary>, String> {
    let dir = docs_dir(&root, &client_slug)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<DocSummary> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read docs dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !file_name.ends_with(".md") || file_name.ends_with(".md.tmp") {
            continue;
        }
        let (fm, body) = match read_doc_file(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        out.push(build_summary(&fm, &body));
    }
    // Newest updated first.
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub fn list_all_docs(root: String) -> Result<Vec<DocSummaryWithClient>, String> {
    let clients = crate::clients::read_clients_file(&root)?;
    let mut out: Vec<DocSummaryWithClient> = Vec::new();
    for client in clients {
        let dir = vault_root(&root)
            .join("Clients")
            .join(&client.name)
            .join("Docs");
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|e| format!("read docs dir: {e}"))? {
            let entry = entry.map_err(|e| format!("read entry: {e}"))?;
            let path = entry.path();
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            if !file_name.ends_with(".md") || file_name.ends_with(".md.tmp") {
                continue;
            }
            let (fm, body) = match read_doc_file(&path) {
                Ok(v) => v,
                Err(_) => continue,
            };
            out.push(DocSummaryWithClient {
                summary: build_summary(&fm, &body),
                client_name: client.name.clone(),
            });
        }
    }
    out.sort_by(|a, b| b.summary.updated_at.cmp(&a.summary.updated_at));
    Ok(out)
}

#[tauri::command]
pub fn read_client_doc(
    root: String,
    client_slug: String,
    doc_id: String,
) -> Result<ClientDoc, String> {
    reject_unsafe("doc id", &doc_id)?;
    let dir = docs_dir(&root, &client_slug)?;
    let path = find_doc_path(&dir, &doc_id)?;
    let (fm, body) = read_doc_file(&path)?;
    Ok(ClientDoc {
        summary: build_summary(&fm, &body),
        body,
    })
}

#[tauri::command]
pub fn create_client_doc(
    app: AppHandle,
    root: String,
    client_slug: String,
    payload: CreateDocPayload,
) -> Result<ClientDoc, String> {
    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return Err("Title cannot be empty.".to_string());
    }
    validate_kind(&payload.kind)?;

    let dir = docs_dir(&root, &client_slug)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create docs dir: {e}"))?;

    let base_slug = slugify_title(&title);
    let final_slug = dedupe_slug(&dir, &base_slug, None);
    let path = doc_path(&dir, &final_slug);

    let now = Utc::now().to_rfc3339();
    let body = payload.body.unwrap_or_default();

    let fm = DocFrontmatter {
        id: new_doc_id(),
        title,
        kind: payload.kind,
        client_slug: client_slug.clone(),
        created_at: now.clone(),
        updated_at: now,
        drive_folder_id: payload.drive_folder_id,
        drive_folder_name: payload.drive_folder_name,
        current_drive_file_id: None,
        current_drive_url: None,
        current_version: 0,
        synced_at: None,
        synced_content_hash: None,
        previous_versions: Vec::new(),
        unswept_orphans: Vec::new(),
    };

    let contents = serialize_doc(&fm, &body)?;
    atomic_write(&path, &contents)?;

    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(ClientDoc {
        summary: build_summary(&fm, &body),
        body,
    })
}

#[tauri::command]
pub fn update_client_doc_body(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
    body: String,
) -> Result<ClientDoc, String> {
    reject_unsafe("doc id", &doc_id)?;
    let dir = docs_dir(&root, &client_slug)?;
    let path = find_doc_path(&dir, &doc_id)?;
    let (mut fm, _) = read_doc_file(&path)?;
    fm.updated_at = Utc::now().to_rfc3339();
    let contents = serialize_doc(&fm, &body)?;
    atomic_write(&path, &contents)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(ClientDoc {
        summary: build_summary(&fm, &body),
        body,
    })
}

#[tauri::command]
pub fn rename_client_doc(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
    new_title: String,
) -> Result<ClientDoc, String> {
    reject_unsafe("doc id", &doc_id)?;
    let trimmed = new_title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Title cannot be empty.".to_string());
    }
    let dir = docs_dir(&root, &client_slug)?;
    let old_path = find_doc_path(&dir, &doc_id)?;
    let (mut fm, body) = read_doc_file(&old_path)?;

    fm.title = trimmed;
    fm.updated_at = Utc::now().to_rfc3339();

    let old_slug = old_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    let base_slug = slugify_title(&fm.title);
    let final_slug = dedupe_slug(&dir, &base_slug, old_slug.as_deref());
    let new_path = doc_path(&dir, &final_slug);

    let contents = serialize_doc(&fm, &body)?;

    if new_path == old_path {
        atomic_write(&new_path, &contents)?;
    } else {
        // Write the new file atomically, then remove the old one.
        atomic_write(&new_path, &contents)?;
        if let Err(e) = fs::remove_file(&old_path) {
            // If cleanup fails, roll back the new file so we don't end up
            // with two copies of the same logical doc.
            let _ = fs::remove_file(&new_path);
            return Err(format!("rename cleanup: {e}"));
        }
    }

    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(ClientDoc {
        summary: build_summary(&fm, &body),
        body,
    })
}

#[tauri::command]
pub fn set_client_doc_target_folder(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
    folder_id: Option<String>,
    folder_name: Option<String>,
) -> Result<ClientDoc, String> {
    reject_unsafe("doc id", &doc_id)?;
    let dir = docs_dir(&root, &client_slug)?;
    let path = find_doc_path(&dir, &doc_id)?;
    let (mut fm, body) = read_doc_file(&path)?;
    fm.drive_folder_id = folder_id.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    fm.drive_folder_name = folder_name.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    fm.updated_at = Utc::now().to_rfc3339();
    let contents = serialize_doc(&fm, &body)?;
    atomic_write(&path, &contents)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(ClientDoc {
        summary: build_summary(&fm, &body),
        body,
    })
}

#[tauri::command]
pub fn delete_client_doc(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
) -> Result<(), String> {
    reject_unsafe("doc id", &doc_id)?;
    let dir = docs_dir(&root, &client_slug)?;
    let path = find_doc_path(&dir, &doc_id)?;
    fs::remove_file(&path).map_err(|e| format!("delete doc: {e}"))?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(())
}
