use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WebDesignerEvent {
    Started {
        id: String,
    },
    Delta {
        id: String,
        text: String,
    },
    Done {
        id: String,
        ok: bool,
        path: Option<String>,
        message: Option<String>,
    },
    Error {
        id: String,
        message: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct WebsiteFile {
    pub name: String,
    pub path: String,
    pub modified_unix: u64,
    pub size_bytes: u64,
    pub mode: String,
}

fn locate_claude() -> Option<PathBuf> {
    if let Ok(p) = which::which("claude") {
        return Some(p);
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        #[cfg(windows)]
        {
            candidates.push(home.join("AppData").join("Roaming").join("npm").join("claude.cmd"));
            candidates.push(home.join("AppData").join("Roaming").join("npm").join("claude.ps1"));
            candidates.push(home.join("AppData").join("Local").join("Programs").join("claude").join("claude.exe"));
        }
        #[cfg(not(windows))]
        {
            candidates.push(home.join(".local").join("bin").join("claude"));
            candidates.push(PathBuf::from("/opt/homebrew/bin/claude"));
            candidates.push(PathBuf::from("/usr/local/bin/claude"));
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

fn build_claude_command(claude_path: &PathBuf) -> Command {
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW — see claude.rs::build_command for rationale.
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let ext = claude_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());
        if matches!(ext.as_deref(), Some("cmd") | Some("bat") | Some("ps1")) {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(claude_path);
            c.creation_flags(CREATE_NO_WINDOW);
            return c;
        }
        let mut c = Command::new(claude_path);
        c.creation_flags(CREATE_NO_WINDOW);
        return c;
    }
    #[cfg(not(windows))]
    Command::new(claude_path)
}

fn websites_dir(root: &str, client_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("vault")
        .join("Clients")
        .join(client_slug)
        .join("websites")
}

/// Outreach target — saves mockups under vault/Outreach/<slug>/revamp/ so the
/// Web Designer can be reused from the outreach wizard without polluting the
/// Clients tree. `slug` is the prospect slug created by the wizard.
fn outreach_revamp_dir(root: &str, prospect_slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("vault")
        .join("Outreach")
        .join(prospect_slug)
        .join("revamp")
}

fn target_output_dir(root: &str, slug: &str, target_kind: &str) -> PathBuf {
    match target_kind {
        "outreach" => outreach_revamp_dir(root, slug),
        _ => websites_dir(root, slug),
    }
}

/// Read the web-designer skill's CLAUDE.md and SKILL.md from the repo root
/// (sibling of the media-buying folder) and format them as a preamble block
/// the agent reads as authoritative style/behavior context. Silently returns
/// an empty string if the files are absent — the user's prompt is already
/// self-contained, so a missing skill is degraded but not broken.
fn skill_preamble(root: &str) -> String {
    let repo_root = match PathBuf::from(root).parent() {
        Some(p) => p.to_path_buf(),
        None => return String::new(),
    };
    let skill_dir = repo_root.join("web-designer");
    let claude_md = skill_dir.join("CLAUDE.md");
    let skill_md = skill_dir.join("SKILL.md");

    let mut parts: Vec<String> = Vec::new();
    if let Ok(body) = std::fs::read_to_string(&claude_md) {
        parts.push(format!("=== web-designer/CLAUDE.md ===\n{}", body.trim()));
    }
    if let Ok(body) = std::fs::read_to_string(&skill_md) {
        parts.push(format!("=== web-designer/SKILL.md ===\n{}", body.trim()));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(
        "SKILL CONTEXT — read this first.\nYou are the Web Designer agent. The following files define your behavior, voice, default structure, niche palettes, and output rules. Treat them as authoritative. The user's task follows after.\n\n{}\n\n=== END SKILL CONTEXT ===\n\n",
        parts.join("\n\n"),
    )
}

fn extract_html(full: &str) -> Option<String> {
    let bytes = full.as_bytes();
    let mut search_from = 0usize;
    while search_from < bytes.len() {
        let rest = &full[search_from..];
        let Some(rel) = rest.find("```") else {
            return None;
        };
        let fence_start = search_from + rel;
        let after_fence = fence_start + 3;
        let line_end = full[after_fence..]
            .find('\n')
            .map(|i| after_fence + i)
            .unwrap_or(full.len());
        let tag = full[after_fence..line_end].trim().to_lowercase();
        let body_start = if line_end < full.len() { line_end + 1 } else { line_end };
        let Some(close_rel) = full[body_start..].find("```") else {
            return None;
        };
        let body_end = body_start + close_rel;
        if tag == "html" || tag.is_empty() {
            let body = full[body_start..body_end].trim_end();
            if body.to_lowercase().contains("<!doctype") || body.to_lowercase().contains("<html") {
                return Some(body.to_string());
            }
        }
        search_from = body_end + 3;
    }
    None
}

fn extract_html_loose(full: &str) -> Option<String> {
    let lower = full.to_lowercase();
    let start = lower.find("<!doctype").or_else(|| lower.find("<html"))?;
    let end_marker = "</html>";
    let end_rel = lower[start..].find(end_marker)?;
    let end = start + end_rel + end_marker.len();
    Some(full[start..end].to_string())
}

#[tauri::command]
pub async fn run_web_designer(
    app: AppHandle,
    id: String,
    root: String,
    client_slug: String,
    mode: String,
    prompt: String,
    business_slug: String,
    target_kind: Option<String>,
) -> Result<(), String> {
    let target = target_kind.as_deref().unwrap_or("client");
    let Some(claude) = locate_claude() else {
        let msg = "Claude Code not detected on PATH. Install from https://claude.ai/code and log in, then restart the app.";
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.to_string(),
            },
        );
        return Err(msg.into());
    };

    let dir = target_output_dir(&root, &client_slug, target);
    if let Err(e) = std::fs::create_dir_all(&dir) {
        let msg = format!("failed to create output dir {}: {}", dir.display(), e);
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }

    let suffix = if mode == "revamp" { "-revamp.html" } else { "-website.html" };
    let filename = format!("{business_slug}{suffix}");
    let out_path = dir.join(&filename);

    let _ = app.emit(
        "web_designer://stream",
        WebDesignerEvent::Started { id: id.clone() },
    );

    let full_prompt = format!("{}{}", skill_preamble(&root), prompt);

    let mut cmd = build_claude_command(&claude);
    cmd.arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("spawn claude: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let p = full_prompt.clone();
        tauri::async_runtime::spawn(async move {
            let _ = stdin.write_all(p.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();

    let app_err = app.clone();
    let id_err = id.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            let mut buf = String::new();
            while let Ok(Some(line)) = reader.next_line().await {
                buf.push_str(&line);
                buf.push('\n');
            }
            if !buf.trim().is_empty() {
                let _ = app_err.emit(
                    "web_designer://stream",
                    WebDesignerEvent::Error {
                        id: id_err.clone(),
                        message: buf,
                    },
                );
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    let mut full = String::new();

    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| format!("read stdout: {e}"))?
    {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match event_type {
            "assistant" => {
                if let Some(content) = value
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in content {
                        if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                full.push_str(text);
                                let _ = app.emit(
                                    "web_designer://stream",
                                    WebDesignerEvent::Delta {
                                        id: id.clone(),
                                        text: text.to_string(),
                                    },
                                );
                            }
                        }
                    }
                }
            }
            "result" => {
                if let Some(text) = value.get("result").and_then(|v| v.as_str()) {
                    if full.is_empty() {
                        full = text.to_string();
                    }
                }
                if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
                    let _ = app.emit(
                        "web_designer://stream",
                        WebDesignerEvent::Error {
                            id: id.clone(),
                            message: err.to_string(),
                        },
                    );
                }
            }
            _ => {}
        }
    }

    let _status = child.wait().await.map_err(|e| format!("wait: {e}"))?;

    let html = extract_html(&full).or_else(|| extract_html_loose(&full));
    let Some(html) = html else {
        let msg = "Claude finished, but no HTML block was found in the response. The agent may have refused or produced an unexpected format.".to_string();
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Done {
                id: id.clone(),
                ok: false,
                path: None,
                message: Some(msg.clone()),
            },
        );
        return Err(msg);
    };

    if let Err(e) = std::fs::write(&out_path, html.as_bytes()) {
        let msg = format!("failed to write {}: {}", out_path.display(), e);
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }

    let _ = app.emit(
        "web_designer://stream",
        WebDesignerEvent::Done {
            id: id.clone(),
            ok: true,
            path: Some(out_path.to_string_lossy().into_owned()),
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn edit_web_designer(
    app: AppHandle,
    id: String,
    root: String,
    client_slug: String,
    file_path: String,
    user_request: String,
    section_scope: Option<String>,
    use_design_polish: bool,
) -> Result<(), String> {
    let _ = &client_slug;
    let Some(claude) = locate_claude() else {
        let msg = "Claude Code not detected on PATH.";
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.into(),
            },
        );
        return Err(msg.into());
    };

    let target = PathBuf::from(&file_path);
    if !target.exists() {
        let msg = format!("file not found: {}", target.display());
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }

    let existing = std::fs::read_to_string(&target)
        .map_err(|e| format!("read file: {e}"))?;

    let scope_line = section_scope
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("\nScope: change ONLY the section with data-section=\"{}\". Leave every other section byte-identical.\n", s))
        .unwrap_or_default();

    let polish_line = if use_design_polish {
        "\nDesign polish mode is ON for this turn: you may push the typography, spacing, and visual hierarchy a notch beyond the baseline web-designer style. Stay tasteful — still a local-business landing page, not an experimental portfolio site.\n"
    } else {
        ""
    };

    let _ = std::fs::create_dir_all(target.parent().unwrap_or_else(|| std::path::Path::new(".")));
    let versions_dir = target.parent().unwrap_or_else(|| std::path::Path::new("."))
        .join(".versions");
    let _ = std::fs::create_dir_all(&versions_dir);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_name = target
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| format!("{}.{}.html", s, stamp))
        .unwrap_or_else(|| format!("backup.{}.html", stamp));
    let backup_path = versions_dir.join(&backup_name);
    let _ = std::fs::write(&backup_path, existing.as_bytes());

    let prompt = format!(
        r#"{preamble}You are editing an existing single-page local business website. The user wants to make a targeted change. Apply the edit and output the COMPLETE updated HTML file in a single fenced ```html code block. Do not include any commentary outside the code block.

User request:
{user_request}
{scope_line}{polish_line}
Rules:
- Output the entire HTML file (not a diff). The app overwrites the file with your output.
- Preserve all data-section attributes on top-level sections.
- Keep the existing accent color token unless the user explicitly asked to change it.
- Keep all copy that the user did not ask to change.
- No Lorem ipsum, ever.

Current file contents:
```html
{existing}
```
"#,
        preamble = skill_preamble(&root),
    );

    let _ = app.emit(
        "web_designer://stream",
        WebDesignerEvent::Started { id: id.clone() },
    );

    let mut cmd = build_claude_command(&claude);
    cmd.arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("spawn claude: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let p = prompt.clone();
        tauri::async_runtime::spawn(async move {
            let _ = stdin.write_all(p.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();

    let app_err = app.clone();
    let id_err = id.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            let mut buf = String::new();
            while let Ok(Some(line)) = reader.next_line().await {
                buf.push_str(&line);
                buf.push('\n');
            }
            if !buf.trim().is_empty() {
                let _ = app_err.emit(
                    "web_designer://stream",
                    WebDesignerEvent::Error {
                        id: id_err.clone(),
                        message: buf,
                    },
                );
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    let mut full = String::new();

    while let Some(line) = reader
        .next_line()
        .await
        .map_err(|e| format!("read stdout: {e}"))?
    {
        if line.trim().is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if event_type == "assistant" {
            if let Some(content) = value
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                for block in content {
                    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            full.push_str(text);
                            let _ = app.emit(
                                "web_designer://stream",
                                WebDesignerEvent::Delta {
                                    id: id.clone(),
                                    text: text.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        } else if event_type == "result" {
            if let Some(text) = value.get("result").and_then(|v| v.as_str()) {
                if full.is_empty() {
                    full = text.to_string();
                }
            }
        }
    }

    let _ = child.wait().await;

    let html = extract_html(&full).or_else(|| extract_html_loose(&full));
    let Some(html) = html else {
        let msg = "Edit returned no HTML block.".to_string();
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Done {
                id: id.clone(),
                ok: false,
                path: None,
                message: Some(msg.clone()),
            },
        );
        return Err(msg);
    };

    if let Err(e) = std::fs::write(&target, html.as_bytes()) {
        let msg = format!("write file: {e}");
        let _ = app.emit(
            "web_designer://stream",
            WebDesignerEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }

    let _ = app.emit(
        "web_designer://stream",
        WebDesignerEvent::Done {
            id: id.clone(),
            ok: true,
            path: Some(target.to_string_lossy().into_owned()),
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn list_web_designer_files(
    root: String,
    client_slug: String,
) -> Result<Vec<WebsiteFile>, String> {
    let dir = websites_dir(&root, &client_slug);
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(files);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("html") {
            continue;
        }
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mode = if name.ends_with("-revamp.html") {
            "revamp".to_string()
        } else {
            "build".to_string()
        };
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        files.push(WebsiteFile {
            name,
            path: p.to_string_lossy().into_owned(),
            modified_unix: modified,
            size_bytes: meta.len(),
            mode,
        });
    }
    files.sort_by(|a, b| b.modified_unix.cmp(&a.modified_unix));
    Ok(files)
}

#[tauri::command]
pub fn read_web_designer_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
pub fn web_designer_dir(root: String, client_slug: String) -> Result<String, String> {
    let dir = websites_dir(&root, &client_slug);
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir.to_string_lossy().into_owned())
}
