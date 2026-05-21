use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneratorOutput {
    pub kind: String,
    pub client: String,
    pub created_at: String,
    pub title: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub inputs_yaml: Option<String>,
    pub body: String,
    pub path: String,
}

const ALLOWED_KINDS: &[&str] = &[
    "hooks",
    "briefs",
    "reports",
    "scale_checks",
    "audits",
    "workflows",
];

fn outputs_dir(root: &str, kind: &str) -> PathBuf {
    PathBuf::from(root).join("outputs").join(kind)
}

fn data_kind_from(kind: &str) -> Option<DataKind> {
    match kind {
        "hooks" => Some(DataKind::Hooks),
        "briefs" => Some(DataKind::Briefs),
        "reports" => Some(DataKind::Reports),
        "scale_checks" => Some(DataKind::ScaleChecks),
        "audits" => Some(DataKind::Audits),
        "workflows" => Some(DataKind::Workflows),
        _ => None,
    }
}

fn yaml_quote(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    let single_line: String = escaped.lines().collect::<Vec<_>>().join(" ");
    format!("\"{}\"", single_line)
}

fn build_frontmatter(out: &GeneratorOutput) -> String {
    let mut s = String::new();
    s.push_str("---\n");
    s.push_str(&format!("kind: {}\n", out.kind));
    s.push_str(&format!("client: {}\n", out.client));
    s.push_str(&format!("created_at: {}\n", out.created_at));
    s.push_str(&format!("title: {}\n", yaml_quote(&out.title)));
    if let Some(summary) = &out.summary {
        let trimmed = summary.trim();
        if !trimmed.is_empty() {
            s.push_str(&format!("summary: {}\n", yaml_quote(trimmed)));
        }
    }
    if let Some(y) = &out.inputs_yaml {
        let trimmed = y.trim();
        if !trimmed.is_empty() {
            s.push_str("inputs:\n");
            for line in trimmed.lines() {
                s.push_str(&format!("  {}\n", line));
            }
        }
    }
    s.push_str("---\n\n");
    s
}

#[tauri::command]
pub fn save_generator_output(
    app: AppHandle,
    root: String,
    client_slug: String,
    kind: String,
    title: String,
    summary: Option<String>,
    body: String,
    inputs_yaml: Option<String>,
) -> Result<GeneratorOutput, String> {
    if !ALLOWED_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown generator kind: {kind}"));
    }

    let dir = outputs_dir(&root, &kind);
    fs::create_dir_all(&dir).map_err(|e| format!("create dirs: {e}"))?;

    let created_at = Utc::now().to_rfc3339();
    let date = Utc::now().format("%Y-%m-%d").to_string();

    let mut path = dir.join(format!("{date}-{client_slug}.md"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{date}-{client_slug}-{n}.md"));
        n += 1;
    }

    let mut output = GeneratorOutput {
        kind: kind.clone(),
        client: client_slug.clone(),
        created_at,
        title,
        summary,
        inputs_yaml,
        body,
        path: String::new(),
    };

    let mut contents = build_frontmatter(&output);
    contents.push_str(output.body.trim_end());
    contents.push('\n');

    fs::write(&path, contents).map_err(|e| format!("write output: {e}"))?;
    output.path = path.to_string_lossy().into_owned();

    if let Some(dk) = data_kind_from(&kind) {
        emit_changed(&app, dk, Some(client_slug), Some(output.path.clone()));
    }
    Ok(output)
}

#[derive(Debug, Deserialize)]
struct OutputFrontmatter {
    kind: Option<String>,
    client: Option<String>,
    created_at: Option<String>,
    title: Option<String>,
    summary: Option<String>,
}

#[tauri::command]
pub fn list_generator_outputs(
    root: String,
    client_slug: String,
    kind: String,
    limit: usize,
) -> Result<Vec<GeneratorOutput>, String> {
    if !ALLOWED_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown generator kind: {kind}"));
    }
    let dir = outputs_dir(&root, &kind);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !file_name.ends_with(".md") {
            continue;
        }
        let stem = file_name.trim_end_matches(".md");
        let parts: Vec<&str> = stem.splitn(4, '-').collect();
        if parts.len() < 4 {
            continue;
        }
        let rest = parts[3];
        let matches_slug = rest == client_slug || rest.starts_with(&format!("{client_slug}-"));
        if !matches_slug {
            continue;
        }
        candidates.push((stem.to_string(), path));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    let mut out: Vec<GeneratorOutput> = Vec::new();
    for (_, path) in candidates.into_iter().take(limit.max(1)) {
        let raw = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (front_yaml, body) = match crate::frontmatter::split(&raw) {
            Some(v) => v,
            None => continue,
        };
        let front: OutputFrontmatter = match serde_yaml::from_str(&front_yaml) {
            Ok(v) => v,
            Err(_) => continue,
        };
        out.push(GeneratorOutput {
            kind: front.kind.unwrap_or_else(|| kind.clone()),
            client: front.client.unwrap_or_else(|| client_slug.clone()),
            created_at: front.created_at.unwrap_or_default(),
            title: front.title.unwrap_or_default(),
            summary: front.summary,
            inputs_yaml: None,
            body: body.trim().to_string(),
            path: path.to_string_lossy().into_owned(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn read_latest_generator_output(
    root: String,
    client_slug: String,
    kind: String,
) -> Result<Option<GeneratorOutput>, String> {
    let mut items = list_generator_outputs(root, client_slug, kind, 1)?;
    Ok(items.pop())
}

fn replace_title_line(yaml: &str, new_title: &str) -> String {
    let quoted = yaml_quote(new_title);
    let mut found = false;
    let mut out = String::with_capacity(yaml.len() + new_title.len());
    for line in yaml.lines() {
        if !found && line.trim_start().starts_with("title:") {
            let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
            out.push_str(&indent);
            out.push_str(&format!("title: {}", quoted));
            out.push('\n');
            found = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !found {
        out.push_str(&format!("title: {}\n", quoted));
    }
    out
}

#[tauri::command]
pub fn rename_generator_output(
    app: AppHandle,
    root: String,
    path: String,
    new_title: String,
) -> Result<String, String> {
    let trimmed = new_title.trim();
    if trimmed.is_empty() {
        return Err("name cannot be empty".into());
    }

    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Err("file not found".into());
    }
    let root_canon = fs::canonicalize(&root).map_err(|e| format!("canonicalize root: {e}"))?;
    let target_canon = fs::canonicalize(target).map_err(|e| format!("canonicalize target: {e}"))?;
    if !target_canon.starts_with(&root_canon) {
        return Err("refusing to rename file outside project root".into());
    }

    let ext = target_canon
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    match ext.as_str() {
        "md" => {
            let raw = fs::read_to_string(&target_canon).map_err(|e| format!("read file: {e}"))?;
            let (front_yaml, body) =
                crate::frontmatter::split(&raw).ok_or("missing frontmatter")?;
            let new_front = replace_title_line(&front_yaml, trimmed);
            let mut out_text = String::new();
            out_text.push_str("---\n");
            out_text.push_str(&new_front);
            out_text.push_str("---\n\n");
            out_text.push_str(&body);
            fs::write(&target_canon, out_text).map_err(|e| format!("write file: {e}"))?;

            // Best-effort change event so other surfaces refresh.
            let kind_from_dir = target_canon
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if let Some(dk) = data_kind_from(kind_from_dir) {
                emit_changed(&app, dk, None, Some(target_canon.to_string_lossy().into_owned()));
            }
            Ok(target_canon.to_string_lossy().into_owned())
        }
        "html" => {
            // Pitch decks: derive display title from a sidecar "<path>.title"
            // file. We never rename the .html itself, so links and Drive
            // pushes stay stable.
            let sidecar = target_canon.with_extension("html.title");
            fs::write(&sidecar, trimmed).map_err(|e| format!("write title sidecar: {e}"))?;
            emit_changed(
                &app,
                DataKind::Briefs,
                None,
                Some(target_canon.to_string_lossy().into_owned()),
            );
            Ok(target_canon.to_string_lossy().into_owned())
        }
        other => Err(format!("cannot rename .{other} file")),
    }
}

#[tauri::command]
pub fn delete_generator_output(root: String, path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Ok(());
    }
    let root_canon = fs::canonicalize(&root).map_err(|e| format!("canonicalize root: {e}"))?;
    let target_canon = fs::canonicalize(target).map_err(|e| format!("canonicalize target: {e}"))?;
    if !target_canon.starts_with(&root_canon) {
        return Err("refusing to delete file outside project root".into());
    }
    let ext = target_canon
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !matches!(ext, "md" | "html") {
        return Err(format!("refusing to delete non-output file: .{ext}"));
    }
    fs::remove_file(&target_canon).map_err(|e| format!("delete file: {e}"))?;
    if ext == "html" {
        let sidecar = target_canon.with_extension("html.title");
        let _ = fs::remove_file(&sidecar);
    }
    Ok(())
}
