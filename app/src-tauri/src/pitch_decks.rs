use chrono::Utc;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::events::{emit_changed, DataKind};
use crate::generators::GeneratorOutput;

fn decks_dir(root: &str, client_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("data")
        .join(client_slug)
        .join("decks")
}

fn strip_html_fence(body: &str) -> String {
    let trimmed = body.trim();
    let lower = trimmed.to_ascii_lowercase();
    let fence_len = if lower.starts_with("```html") {
        7
    } else if lower.starts_with("```") {
        3
    } else {
        return trimmed.to_string();
    };
    let after_open = trimmed[fence_len..].trim_start_matches(|c: char| c == '\n' || c == '\r');
    if let Some(close_idx) = after_open.rfind("```") {
        let candidate = after_open[..close_idx].trim_end();
        let lc = candidate.to_ascii_lowercase();
        if fence_len == 7 || lc.contains("<!doctype") || lc.contains("<html") {
            return candidate.to_string();
        }
    }
    trimmed.to_string()
}

#[tauri::command]
pub fn save_pitch_deck(
    app: AppHandle,
    root: String,
    client_slug: String,
    title: String,
    summary: Option<String>,
    body: String,
) -> Result<GeneratorOutput, String> {
    let dir = decks_dir(&root, &client_slug);
    fs::create_dir_all(&dir).map_err(|e| format!("create dirs: {e}"))?;

    let created_at = Utc::now().to_rfc3339();
    let stamp = Utc::now().format("%Y-%m-%d-%H%M%S").to_string();

    let mut path = dir.join(format!("{stamp}-pitch.html"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stamp}-pitch-{n}.html"));
        n += 1;
    }

    let html = strip_html_fence(&body);
    fs::write(&path, &html).map_err(|e| format!("write deck: {e}"))?;

    let saved_path = path.to_string_lossy().into_owned();
    let url = format!("file:///{}", saved_path.replace('\\', "/"));
    let _ = app.opener().open_url(url, None::<&str>);

    emit_changed(
        &app,
        DataKind::Briefs,
        Some(client_slug.clone()),
        Some(saved_path.clone()),
    );

    Ok(GeneratorOutput {
        kind: "html".into(),
        client: client_slug,
        created_at,
        title,
        summary,
        inputs_yaml: None,
        body: html,
        path: saved_path,
    })
}

#[tauri::command]
pub fn list_pitch_decks(
    root: String,
    client_slug: String,
    limit: usize,
) -> Result<Vec<GeneratorOutput>, String> {
    let dir = decks_dir(&root, &client_slug);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read decks dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !file_name.ends_with(".html") {
            continue;
        }
        candidates.push((file_name, path));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    let mut out: Vec<GeneratorOutput> = Vec::new();
    for (file_name, path) in candidates.into_iter().take(limit.max(1)) {
        let body = fs::read_to_string(&path).unwrap_or_default();
        let sidecar = path.with_extension("html.title");
        let title = fs::read_to_string(&sidecar)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| file_name.trim_end_matches(".html").to_string());
        let meta = fs::metadata(&path).ok();
        let created_at = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                let secs = d.as_secs() as i64;
                chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            })
            .unwrap_or_default();
        out.push(GeneratorOutput {
            kind: "html".into(),
            client: client_slug.clone(),
            created_at,
            title,
            summary: None,
            inputs_yaml: None,
            body,
            path: path.to_string_lossy().into_owned(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn open_pitch_deck(app: AppHandle, path: String) -> Result<(), String> {
    let url = format!("file:///{}", path.replace('\\', "/"));
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("open browser: {e}"))
}
