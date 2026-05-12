use crate::events::{emit_changed, DataKind};
use crate::frontmatter;
use crate::vault::vault_root;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Filesystem layout: vault/Knowledge/SOP-XXXX - <title>.md
/// Frontmatter: type: sop, id: SOP-XXXX, title, summary, tags
/// Body: freeform markdown with `- [ ]` checklist lines.
///
/// Run state for SOPs lives in the dashboard-state JSON, not in the .md file.
/// The .md is the template; the JSON stores executions.

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct SopFront {
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SopSummary {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub tags: Vec<String>,
    pub path: String,
    /// Number of `- [ ]` / `- [x]` lines in the template. Lets the list show
    /// "8 steps" without a second round-trip.
    pub step_count: usize,
    /// Unix ms — last modified time of the underlying .md file.
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SopFile {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub tags: Vec<String>,
    pub body: String,
    pub path: String,
    pub updated_at: i64,
}

fn knowledge_dir(root: &str) -> PathBuf {
    vault_root(root).join("Knowledge")
}

fn parse_front(raw: &str) -> (SopFront, String) {
    match frontmatter::split(raw) {
        Some((yaml, body)) => {
            let parsed: SopFront = serde_yaml::from_str(&yaml).unwrap_or_default();
            (parsed, body)
        }
        None => (SopFront::default(), raw.to_string()),
    }
}

fn is_sop(front: &SopFront, filename: &str) -> bool {
    if front.kind.as_deref().map(str::to_lowercase) == Some("sop".to_string()) {
        return true;
    }
    // Fallback: a stray SOP-prefixed file with no/missing type still counts.
    filename.starts_with("SOP-")
}

fn count_steps(body: &str) -> usize {
    body.lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with("- [ ]")
                || trimmed.starts_with("- [x]")
                || trimmed.starts_with("- [X]")
        })
        .count()
}

fn file_mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn sanitize_title_for_filename(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    for ch in title.chars() {
        match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => out.push('-'),
            _ => out.push(ch),
        }
    }
    out.trim().to_string()
}

fn find_sop_path(dir: &Path, sop_id: &str) -> Option<PathBuf> {
    let rd = fs::read_dir(dir).ok()?;
    let id_prefix = format!("{} ", sop_id);
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if name == sop_id || name.starts_with(&id_prefix) {
            return Some(p);
        }
    }
    None
}

fn next_sop_id(dir: &Path) -> String {
    let mut max = 0u32;
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if !stem.starts_with("SOP-") {
                continue;
            }
            // SOP-0007 or "SOP-0007 - Title"
            let after = &stem[4..];
            let num_part = after.split(|c: char| !c.is_ascii_digit()).next().unwrap_or("");
            if let Ok(n) = num_part.parse::<u32>() {
                if n > max {
                    max = n;
                }
            }
        }
    }
    format!("SOP-{:04}", max + 1)
}

fn render_sop(front: &SopFront, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(front).map_err(|e| format!("serialize front: {e}"))?;
    let trimmed = yaml.trim_start_matches("---\n");
    let body_clean = body.trim_start_matches('\n');
    Ok(format!("---\n{trimmed}---\n\n{body_clean}"))
}

#[tauri::command]
pub fn list_sops(root: String) -> Result<Vec<SopSummary>, String> {
    let dir = knowledge_dir(&root);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("read Knowledge: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let filename = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let raw = match fs::read_to_string(&p) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (front, body) = parse_front(&raw);
        if !is_sop(&front, &filename) {
            continue;
        }
        let id = front.id.clone().unwrap_or_else(|| {
            // Derive id from filename: "SOP-0001 - Foo" -> "SOP-0001"
            filename
                .split(" - ")
                .next()
                .unwrap_or(&filename)
                .trim()
                .to_string()
        });
        let title = front.title.clone().unwrap_or_else(|| {
            filename
                .splitn(2, " - ")
                .nth(1)
                .map(|s| s.to_string())
                .unwrap_or_else(|| id.clone())
        });
        out.push(SopSummary {
            id,
            title,
            summary: front.summary.clone(),
            tags: front.tags.clone(),
            path: p.to_string_lossy().into_owned(),
            step_count: count_steps(&body),
            updated_at: file_mtime_ms(&p),
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

#[tauri::command]
pub fn read_sop(root: String, sop_id: String) -> Result<SopFile, String> {
    let dir = knowledge_dir(&root);
    let path = find_sop_path(&dir, &sop_id)
        .ok_or_else(|| format!("SOP not found: {sop_id}"))?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("read sop: {e}"))?;
    let (front, body) = parse_front(&raw);
    let id = front.id.clone().unwrap_or_else(|| sop_id.clone());
    let title = front.title.clone().unwrap_or_else(|| id.clone());
    Ok(SopFile {
        id,
        title,
        summary: front.summary,
        tags: front.tags,
        body,
        path: path.to_string_lossy().into_owned(),
        updated_at: file_mtime_ms(&path),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SopWriteArgs {
    pub title: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub body: String,
}

#[tauri::command]
pub fn write_sop(
    app: AppHandle,
    root: String,
    sop_id: String,
    args: SopWriteArgs,
) -> Result<SopFile, String> {
    let dir = knowledge_dir(&root);
    fs::create_dir_all(&dir).map_err(|e| format!("create Knowledge dir: {e}"))?;

    let existing = find_sop_path(&dir, &sop_id);
    let safe_title = sanitize_title_for_filename(&args.title);
    let new_filename = if safe_title.is_empty() {
        format!("{sop_id}.md")
    } else {
        format!("{sop_id} - {safe_title}.md")
    };
    let target_path = dir.join(&new_filename);

    let front = SopFront {
        kind: Some("sop".to_string()),
        id: Some(sop_id.clone()),
        title: Some(args.title.clone()),
        summary: args.summary.clone().filter(|s| !s.trim().is_empty()),
        tags: args.tags.clone(),
    };
    let rendered = render_sop(&front, &args.body)?;

    // If renaming (title changed → filename changed), remove the old file.
    if let Some(old) = &existing {
        if old != &target_path {
            fs::write(&target_path, &rendered).map_err(|e| format!("write sop: {e}"))?;
            let _ = fs::remove_file(old);
        } else {
            fs::write(&target_path, &rendered).map_err(|e| format!("write sop: {e}"))?;
        }
    } else {
        fs::write(&target_path, &rendered).map_err(|e| format!("write sop: {e}"))?;
    }

    let path_str = target_path.to_string_lossy().into_owned();
    emit_changed(&app, DataKind::Vault, None, Some(path_str.clone()));

    Ok(SopFile {
        id: sop_id,
        title: args.title,
        summary: front.summary,
        tags: args.tags,
        body: args.body,
        path: path_str,
        updated_at: file_mtime_ms(&target_path),
    })
}

#[tauri::command]
pub fn create_sop(app: AppHandle, root: String, title: String) -> Result<SopFile, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Title cannot be empty.".to_string());
    }
    let dir = knowledge_dir(&root);
    fs::create_dir_all(&dir).map_err(|e| format!("create Knowledge dir: {e}"))?;
    let sop_id = next_sop_id(&dir);
    let body = format!(
        "# {title}\n\n_Add an intro: what this SOP covers, when to run it, who it's for._\n\n## Steps\n\n- [ ] First step\n- [ ] Second step\n- [ ] Third step\n",
        title = trimmed,
    );
    let args = SopWriteArgs {
        title: trimmed,
        summary: None,
        tags: vec!["sop".to_string()],
        body,
    };
    write_sop(app, root, sop_id, args)
}

#[tauri::command]
pub fn delete_sop(app: AppHandle, root: String, sop_id: String) -> Result<(), String> {
    let dir = knowledge_dir(&root);
    let path = find_sop_path(&dir, &sop_id)
        .ok_or_else(|| format!("SOP not found: {sop_id}"))?;
    fs::remove_file(&path).map_err(|e| format!("delete sop: {e}"))?;
    emit_changed(
        &app,
        DataKind::Vault,
        None,
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}
