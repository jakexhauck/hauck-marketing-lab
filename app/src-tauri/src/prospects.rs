//! Prospects (Outreach pillar) — lightweight, file-backed.
//!
//! Each prospect lives at `vault/Outreach/<slug>/` with at minimum a
//! `profile.md` carrying a small frontmatter block. The frontend renders a
//! per-prospect surface and the Outreach hub's prospects table from the
//! entries returned here.
//!
//! Folder layout (canonical):
//!
//!   vault/Outreach/<slug>/
//!     profile.md           — yaml frontmatter: name, niche, status, url, last_touched
//!     contact.md           — (optional) contact info
//!     revamp/              — (optional) Web Designer output for this prospect
//!     scraper-row.json     — (optional) original lead scraper row
//!
//! `list_prospects` enumerates folders under `vault/Outreach/` and reads the
//! profile.md frontmatter. Missing files / fields fall back to safe defaults.

use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
pub enum ProspectStatus {
    Scraped,
    MockupReady,
    SequenceSent,
    Replied,
    Scheduled,
    Showed,
    NoShow,
    Closed,
}

impl Default for ProspectStatus {
    fn default() -> Self {
        ProspectStatus::Scraped
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProspectEntry {
    pub slug: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub niche: Option<String>,
    pub status: ProspectStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "lastTouchedAt")]
    pub last_touched_at: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct ProspectFrontmatter {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    niche: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    last_touched: Option<String>,
}

fn outreach_root(root: &str) -> PathBuf {
    vault_root(root).join("Outreach")
}

fn slug_from_dir(dir: &Path) -> Option<String> {
    dir.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

fn parse_status(s: Option<&str>) -> ProspectStatus {
    match s.map(|v| v.trim().to_lowercase()) {
        Some(s) if s == "mockup-ready" || s == "mockup_ready" => ProspectStatus::MockupReady,
        Some(s) if s == "sequence-sent" || s == "sequence_sent" => ProspectStatus::SequenceSent,
        Some(s) if s == "replied" => ProspectStatus::Replied,
        Some(s) if s == "scheduled" => ProspectStatus::Scheduled,
        Some(s) if s == "showed" => ProspectStatus::Showed,
        Some(s) if s == "no-show" || s == "no_show" => ProspectStatus::NoShow,
        Some(s) if s == "closed" => ProspectStatus::Closed,
        _ => ProspectStatus::Scraped,
    }
}

fn read_profile(dir: &Path) -> ProspectFrontmatter {
    let profile_path = dir.join("profile.md");
    if !profile_path.exists() {
        return ProspectFrontmatter::default();
    }
    let raw = match fs::read_to_string(&profile_path) {
        Ok(s) => s,
        Err(_) => return ProspectFrontmatter::default(),
    };
    match crate::frontmatter::split(&raw) {
        Some((yaml, _body)) => {
            serde_yaml::from_str::<ProspectFrontmatter>(&yaml).unwrap_or_default()
        }
        None => ProspectFrontmatter::default(),
    }
}

fn entry_from_dir(dir: &Path) -> Option<ProspectEntry> {
    let slug = slug_from_dir(dir)?;
    if slug.starts_with('.') || slug.starts_with('_') {
        return None;
    }
    let front = read_profile(dir);
    let name = front
        .name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| slug.replace('-', " "));
    Some(ProspectEntry {
        slug,
        name,
        niche: front.niche,
        status: parse_status(front.status.as_deref()),
        url: front.url,
        last_touched_at: front.last_touched,
    })
}

#[tauri::command]
pub fn list_prospects(root: String) -> Result<Vec<ProspectEntry>, String> {
    let dir = outreach_root(&root);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut entries: Vec<ProspectEntry> = Vec::new();
    let read_dir = fs::read_dir(&dir).map_err(|e| format!("read outreach dir: {e}"))?;
    for child in read_dir.flatten() {
        let path = child.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(entry) = entry_from_dir(&path) {
            entries.push(entry);
        }
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
pub fn read_prospect(root: String, slug: String) -> Result<Option<ProspectEntry>, String> {
    let dir = outreach_root(&root).join(&slug);
    if !dir.exists() {
        return Ok(None);
    }
    Ok(entry_from_dir(&dir))
}

#[derive(Debug, Deserialize)]
pub struct LeadRow {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    niche: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    slug: Option<String>,
}

fn slugify(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    let mut out = String::with_capacity(lower.len());
    let mut prev_dash = false;
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    if out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        out.push_str("prospect");
    }
    out
}

#[tauri::command]
pub fn promote_lead_to_prospect(
    app: AppHandle,
    root: String,
    row: LeadRow,
) -> Result<ProspectEntry, String> {
    let name = row
        .name
        .clone()
        .filter(|n| !n.trim().is_empty())
        .ok_or_else(|| "row missing name".to_string())?;
    let slug = row
        .slug
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| slugify(&name));
    let dir = outreach_root(&root).join(&slug);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("create prospect dir: {e}"))?;
    }
    let profile_path = dir.join("profile.md");
    let now = chrono::Utc::now().to_rfc3339();
    let mut yaml_lines: Vec<String> = vec!["---".to_string()];
    yaml_lines.push(format!("name: {}", yaml_quote(&name)));
    if let Some(niche) = row.niche.as_ref().filter(|n| !n.trim().is_empty()) {
        yaml_lines.push(format!("niche: {}", yaml_quote(niche)));
    }
    yaml_lines.push("status: scraped".to_string());
    if let Some(url) = row.url.as_ref().filter(|u| !u.trim().is_empty()) {
        yaml_lines.push(format!("url: {}", yaml_quote(url)));
    }
    yaml_lines.push(format!("last_touched: {now}"));
    yaml_lines.push("---".to_string());
    yaml_lines.push(String::new());
    yaml_lines.push(format!("# {name}"));
    yaml_lines.push(String::new());
    yaml_lines.push("Promoted from lead scraper.".to_string());
    let body = yaml_lines.join("\n");
    fs::write(&profile_path, body).map_err(|e| format!("write profile.md: {e}"))?;
    emit_changed(
        &app,
        DataKind::Vault,
        Some(slug.clone()),
        Some(profile_path.to_string_lossy().into_owned()),
    );
    Ok(ProspectEntry {
        slug,
        name,
        niche: row.niche,
        status: ProspectStatus::Scraped,
        url: row.url,
        last_touched_at: Some(now),
    })
}

fn yaml_quote(s: &str) -> String {
    if s.contains([':', '#', '\n']) || s.contains('"') {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

/// Inputs for the manual "+ Add booked call" form in the Outreach hub.
/// Every field except `name` is optional — the form is designed for a quick
/// jot when a cold call lands a booking.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualProspectInput {
    pub name: String,
    #[serde(default)]
    pub niche: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub contact_name: Option<String>,
    #[serde(default)]
    pub contact_phone: Option<String>,
    #[serde(default)]
    pub contact_email: Option<String>,
    /// RFC3339 timestamp of the scheduled discovery call, if any.
    #[serde(default)]
    pub scheduled_at: Option<String>,
    /// kebab-case status string (scheduled / showed / closed / no-show etc.).
    /// Defaults to "scheduled" when missing.
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[tauri::command]
pub fn add_prospect(
    app: AppHandle,
    root: String,
    input: ManualProspectInput,
) -> Result<ProspectEntry, String> {
    let name = input
        .name
        .trim()
        .to_string();
    if name.is_empty() {
        return Err("Business name is required.".to_string());
    }
    let slug = slugify(&name);
    let dir = outreach_root(&root).join(&slug);
    if dir.exists() {
        return Err(format!(
            "A prospect with slug '{slug}' already exists. Pick a different business name."
        ));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("create prospect dir: {e}"))?;
    let profile_path = dir.join("profile.md");
    let now = chrono::Utc::now().to_rfc3339();
    let status_str = input
        .status
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("scheduled")
        .to_string();
    let status = parse_status(Some(status_str.as_str()));

    let mut yaml: Vec<String> = vec!["---".to_string()];
    yaml.push(format!("name: {}", yaml_quote(&name)));
    if let Some(v) = input.niche.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("niche: {}", yaml_quote(v)));
    }
    yaml.push(format!("status: {status_str}"));
    if let Some(v) = input.url.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("url: {}", yaml_quote(v)));
    }
    if let Some(v) = input.contact_name.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("contact_name: {}", yaml_quote(v)));
    }
    if let Some(v) = input.contact_phone.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("contact_phone: {}", yaml_quote(v)));
    }
    if let Some(v) = input.contact_email.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("contact_email: {}", yaml_quote(v)));
    }
    if let Some(v) = input.scheduled_at.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(format!("scheduled_at: {}", yaml_quote(v)));
    }
    yaml.push(format!("last_touched: {now}"));
    yaml.push("---".to_string());
    yaml.push(String::new());
    yaml.push(format!("# {name}"));
    yaml.push(String::new());
    if let Some(notes) = input.notes.as_ref().filter(|v| !v.trim().is_empty()) {
        yaml.push(notes.trim().to_string());
    } else {
        yaml.push("Added manually from the Outreach hub.".to_string());
    }
    let body = yaml.join("\n");
    fs::write(&profile_path, body).map_err(|e| format!("write profile.md: {e}"))?;
    emit_changed(
        &app,
        DataKind::Vault,
        Some(slug.clone()),
        Some(profile_path.to_string_lossy().into_owned()),
    );

    Ok(ProspectEntry {
        slug,
        name,
        niche: input.niche,
        status,
        url: input.url,
        last_touched_at: Some(now),
    })
}

#[tauri::command]
pub fn delete_prospect(
    app: AppHandle,
    root: String,
    slug: String,
) -> Result<(), String> {
    let dir = outreach_root(&root).join(&slug);
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("delete prospect: {e}"))?;
    emit_changed(&app, DataKind::Vault, Some(slug), None);
    Ok(())
}

#[tauri::command]
pub fn update_prospect_status(
    app: AppHandle,
    root: String,
    slug: String,
    status: String,
) -> Result<ProspectEntry, String> {
    let dir = outreach_root(&root).join(&slug);
    if !dir.exists() {
        return Err(format!("Prospect not found: {slug}"));
    }
    let profile_path = dir.join("profile.md");
    let raw = fs::read_to_string(&profile_path)
        .map_err(|e| format!("read profile.md: {e}"))?;
    let (yaml, body) = match crate::frontmatter::split(&raw) {
        Some((y, b)) => (y.to_string(), b.to_string()),
        None => (String::new(), raw),
    };
    let mut lines: Vec<String> = yaml.lines().map(|l| l.to_string()).collect();
    let mut found_status = false;
    for line in lines.iter_mut() {
        if line.trim_start().starts_with("status:") {
            *line = format!("status: {status}");
            found_status = true;
            break;
        }
    }
    if !found_status {
        lines.push(format!("status: {status}"));
    }
    let new_yaml = lines.join("\n");
    let new_raw = format!("---\n{new_yaml}\n---\n{body}");
    fs::write(&profile_path, new_raw).map_err(|e| format!("write profile.md: {e}"))?;
    emit_changed(
        &app,
        DataKind::Vault,
        Some(slug.clone()),
        Some(profile_path.to_string_lossy().into_owned()),
    );
    entry_from_dir(&dir).ok_or_else(|| "Could not read updated prospect.".to_string())
}
