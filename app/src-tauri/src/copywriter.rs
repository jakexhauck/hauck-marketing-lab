//! Copywriter — runs the `/write-dms` style flow.
//!
//! Reads a leads CSV produced by the lead scraper, embeds it inline in the
//! user's DM-writing prompt, runs Claude Code (`claude -p`) with stream-json
//! output, captures the resulting markdown table, and saves it next to the
//! source CSV at `<scraper>/prospects/dms-<csv-basename>.md`.
//!
//! Frontend listens on `copywriter://stream` for incremental deltas + the
//! final done event with the saved path.

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CopywriterEvent {
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
        body: Option<String>,
        message: Option<String>,
    },
    Error {
        id: String,
        message: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct DmFile {
    pub name: String,
    pub path: String,
    pub modified_unix: u64,
    pub size_bytes: u64,
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

fn scraper_dir(root: &str) -> Result<PathBuf, String> {
    let r = PathBuf::from(root);
    let parent = r
        .parent()
        .ok_or_else(|| "could not determine repo root from media-buying path".to_string())?;
    let dir = parent.join("lead-scraper");
    if !dir.exists() {
        return Err(format!(
            "lead-scraper directory not found at {}.",
            dir.display()
        ));
    }
    Ok(dir)
}

fn prospects_dir(root: &str) -> Result<PathBuf, String> {
    Ok(scraper_dir(root)?.join("prospects"))
}

/// Read the copywriter skill's CLAUDE.md + SKILL.md from the repo root and
/// format as an authoritative preamble. Mirrors the web_designer flow.
fn skill_preamble(root: &str) -> String {
    let repo_root = match PathBuf::from(root).parent() {
        Some(p) => p.to_path_buf(),
        None => return String::new(),
    };
    let skill_dir = repo_root.join("copywriter");
    let claude_md = skill_dir.join("CLAUDE.md");
    let skill_md = skill_dir.join("SKILL.md");

    let mut parts: Vec<String> = Vec::new();
    if let Ok(body) = std::fs::read_to_string(&claude_md) {
        parts.push(format!("=== copywriter/CLAUDE.md ===\n{}", body.trim()));
    }
    if let Ok(body) = std::fs::read_to_string(&skill_md) {
        parts.push(format!("=== copywriter/SKILL.md ===\n{}", body.trim()));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(
        "SKILL CONTEXT — read this first.\nYou are the Copywriter agent. The following files define your behavior, voice rules, and output format. Treat them as authoritative. The user's task follows after.\n\n{}\n\n=== END SKILL CONTEXT ===\n\n",
        parts.join("\n\n"),
    )
}

/// Pull a markdown table block from the agent's full text response.
/// Falls back to returning the full text if no table is detected (so the
/// user still sees something useful).
fn extract_markdown_table(full: &str) -> String {
    // Look for the first markdown table — a line that contains `|` followed
    // by a separator row `|---|---|`. Take everything from that first table
    // header to the end of the contiguous table block.
    let lines: Vec<&str> = full.lines().collect();
    let mut start: Option<usize> = None;
    for i in 0..lines.len().saturating_sub(1) {
        let row = lines[i].trim();
        let sep = lines[i + 1].trim();
        if row.starts_with('|')
            && row.ends_with('|')
            && sep.starts_with('|')
            && sep.contains("---")
        {
            start = Some(i);
            break;
        }
    }
    let Some(s) = start else {
        return full.trim().to_string();
    };
    let mut end = s;
    for j in s..lines.len() {
        let row = lines[j].trim();
        if row.starts_with('|') && row.ends_with('|') {
            end = j;
        } else if j > s + 1 {
            break;
        }
    }
    lines[s..=end].join("\n")
}

fn dm_filename_for_csv(csv_path: &PathBuf) -> String {
    let stem = csv_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("dms");
    // Strip leading "leads-" if present (scraper output uses bare slug today,
    // but accommodate either naming).
    let trimmed = stem.strip_prefix("leads-").unwrap_or(stem);
    format!("dms-{trimmed}.md")
}

fn build_dm_prompt(csv_path: &PathBuf, csv_body: &str, user_instructions: &str) -> String {
    let csv_name = csv_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "leads.csv".to_string());

    let preamble = if user_instructions.trim().is_empty() {
        String::from(
            r#"I have this list of local businesses I want to reach out to about running ads for them.

For each business, write a short personalized DM (2-3 sentences max) that:
- References something specific about their business
- Points out a gap or opportunity (bad website, no ads, etc.)
- Ends with a soft ask to jump on a quick call

Keep it casual and conversational, not salesy. Sound like a real person who genuinely noticed something about their business, not like a template blast.

Output as a markdown table with exactly these columns: Business Name | Platform | Message
Where Platform is one of: Instagram, Email, SMS — pick the channel most likely to land for that business.
Output ONLY the markdown table — no preamble, no commentary after."#,
        )
    } else {
        user_instructions.trim().to_string()
    };

    format!(
        "{preamble}\n\nLeads CSV ({csv_name}):\n\n```csv\n{csv_body}\n```\n",
        preamble = preamble,
        csv_name = csv_name,
        csv_body = csv_body.trim(),
    )
}

#[tauri::command]
pub async fn run_copywriter(
    app: AppHandle,
    id: String,
    root: String,
    csv_path: String,
    user_instructions: String,
) -> Result<(), String> {
    let Some(claude) = locate_claude() else {
        let msg = "Claude Code not detected on PATH. Install from https://claude.ai/code and log in, then restart the app.";
        let _ = app.emit(
            "copywriter://stream",
            CopywriterEvent::Error {
                id: id.clone(),
                message: msg.to_string(),
            },
        );
        return Err(msg.into());
    };

    let csv = PathBuf::from(&csv_path);
    if !csv.exists() {
        let msg = format!("CSV not found at {csv_path}");
        let _ = app.emit(
            "copywriter://stream",
            CopywriterEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }
    let csv_body = std::fs::read_to_string(&csv)
        .map_err(|e| format!("read csv: {e}"))?;

    let out_dir = prospects_dir(&root)?;
    if let Err(e) = std::fs::create_dir_all(&out_dir) {
        let msg = format!("failed to create prospects dir {}: {}", out_dir.display(), e);
        let _ = app.emit(
            "copywriter://stream",
            CopywriterEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }
    let out_path = out_dir.join(dm_filename_for_csv(&csv));

    let _ = app.emit(
        "copywriter://stream",
        CopywriterEvent::Started { id: id.clone() },
    );

    let full_prompt = format!(
        "{}{}",
        skill_preamble(&root),
        build_dm_prompt(&csv, &csv_body, &user_instructions),
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
                    "copywriter://stream",
                    CopywriterEvent::Error {
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
                                    "copywriter://stream",
                                    CopywriterEvent::Delta {
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
                        "copywriter://stream",
                        CopywriterEvent::Error {
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

    if full.trim().is_empty() {
        let msg = "Copywriter finished but produced no output.".to_string();
        let _ = app.emit(
            "copywriter://stream",
            CopywriterEvent::Done {
                id: id.clone(),
                ok: false,
                path: None,
                body: None,
                message: Some(msg.clone()),
            },
        );
        return Err(msg);
    }

    let table = extract_markdown_table(&full);
    let body = format!(
        "# DMs from {}\n\n_Generated {}_\n\n{}\n",
        csv.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "leads.csv".to_string()),
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
        table.trim(),
    );

    if let Err(e) = std::fs::write(&out_path, body.as_bytes()) {
        let msg = format!("failed to write {}: {}", out_path.display(), e);
        let _ = app.emit(
            "copywriter://stream",
            CopywriterEvent::Error {
                id: id.clone(),
                message: msg.clone(),
            },
        );
        return Err(msg);
    }

    let _ = app.emit(
        "copywriter://stream",
        CopywriterEvent::Done {
            id: id.clone(),
            ok: true,
            path: Some(out_path.to_string_lossy().into_owned()),
            body: Some(body),
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn list_dm_files(root: String) -> Result<Vec<DmFile>, String> {
    let dir = prospects_dir(&root)?;
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(files);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with("dms-") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        files.push(DmFile {
            name: name.to_string(),
            path: p.to_string_lossy().into_owned(),
            modified_unix: modified,
            size_bytes: meta.len(),
        });
    }
    files.sort_by(|a, b| b.modified_unix.cmp(&a.modified_unix));
    Ok(files)
}

#[tauri::command]
pub fn read_dm_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}
