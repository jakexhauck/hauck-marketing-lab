//! Builder sessions — VS-Code-style coding chats.
//!
//! Each session spawns the real `claude` CLI in headless streaming mode
//! (`claude -p --output-format stream-json`), pinned to a project working
//! directory, with a per-session permission mode and optional `--resume` for
//! multi-turn continuity. Unlike the copywriter chat (`invoke_claude`), these
//! sessions:
//!   - run in the project's `cwd` so file edits land in the right repo,
//!   - pass `--permission-mode` so the agent can actually edit files headless,
//!   - emit `ToolUse` + `SessionId` stream events for a richer UI,
//!   - register their child process so the UI can Stop a runaway session.

use crate::claude::{build_command, locate_claude, StreamEvent};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;

/// Registry of in-flight builder children, keyed by the per-turn stream id,
/// so `stop_builder` can kill a running session.
#[derive(Default)]
pub struct BuilderState {
    running: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
}

impl BuilderState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Map the UI's coarse mode names onto claude's `--permission-mode` values.
/// Anything unrecognised falls back to `acceptEdits` (the safe building default).
fn permission_flag(mode: &str) -> &'static str {
    match mode {
        "plan" => "plan",
        "auto" | "bypass" | "yolo" => "bypassPermissions",
        _ => "acceptEdits",
    }
}

/// Build a one-line human summary of a tool_use block for the activity feed.
fn tool_detail(name: &str, input: &Value) -> String {
    let s = |k: &str| input.get(k).and_then(|v| v.as_str()).unwrap_or("");
    match name {
        "Edit" | "Write" | "Read" | "NotebookEdit" => s("file_path").to_string(),
        "Bash" => {
            let cmd = s("command");
            if cmd.len() > 120 {
                format!("{}…", &cmd[..120])
            } else {
                cmd.to_string()
            }
        }
        "Glob" | "Grep" => {
            let pat = s("pattern");
            let path = s("path");
            if path.is_empty() {
                pat.to_string()
            } else {
                format!("{pat} in {path}")
            }
        }
        "Task" | "Agent" => s("description").to_string(),
        "TodoWrite" => "updated plan".to_string(),
        _ => String::new(),
    }
}

#[tauri::command]
pub async fn stop_builder(state: State<'_, BuilderState>, id: String) -> Result<(), String> {
    let child = {
        let map = state.running.lock().await;
        map.get(&id).cloned()
    };
    if let Some(child) = child {
        let _ = child.lock().await.start_kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn invoke_builder(
    app: AppHandle,
    state: State<'_, BuilderState>,
    id: String,
    prompt: String,
    cwd: String,
    mode: String,
    // claude session id to resume; None starts a fresh session.
    resume: Option<String>,
) -> Result<String, String> {
    let Some(path) = locate_claude() else {
        let _ = app.emit(
            "claude://stream",
            StreamEvent::Error {
                id: id.clone(),
                message: "Claude Code not detected. Install from https://claude.ai/code and log in, then restart the app.".into(),
            },
        );
        return Err("claude not found".into());
    };

    let _ = app.emit("claude://stream", StreamEvent::Started { id: id.clone() });

    let mut cmd = build_command(&path);
    cmd.current_dir(&cwd)
        .arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--permission-mode")
        .arg(permission_flag(&mode));
    if let Some(sid) = resume.as_deref() {
        if !sid.trim().is_empty() {
            cmd.arg("--resume").arg(sid);
        }
    }
    cmd.stdin(Stdio::piped())
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

    // Register the child so stop_builder can kill it. stdout/stderr are already
    // taken, so the only remaining use of `child` is wait()/kill().
    let child_arc = Arc::new(Mutex::new(child));
    state
        .running
        .lock()
        .await
        .insert(id.clone(), Arc::clone(&child_arc));

    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_handle = stderr.map(|stderr| {
        let buf = Arc::clone(&stderr_buf);
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut b = buf.lock().await;
                b.push_str(&line);
                b.push('\n');
            }
        })
    });

    let mut reader = BufReader::new(stdout).lines();
    let mut full = String::new();
    let mut emitted_session = false;

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

        // Capture the session id from whichever event carries it first.
        if !emitted_session {
            if let Some(sid) = value.get("session_id").and_then(|v| v.as_str()) {
                emitted_session = true;
                let _ = app.emit(
                    "claude://stream",
                    StreamEvent::SessionId {
                        id: id.clone(),
                        session_id: sid.to_string(),
                    },
                );
            }
        }

        let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match event_type {
            "assistant" => {
                if let Some(content) = value
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for block in content {
                        match block.get("type").and_then(|t| t.as_str()) {
                            Some("text") => {
                                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                    full.push_str(text);
                                    let _ = app.emit(
                                        "claude://stream",
                                        StreamEvent::Delta {
                                            id: id.clone(),
                                            text: text.to_string(),
                                        },
                                    );
                                }
                            }
                            Some("tool_use") => {
                                let name = block
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("tool")
                                    .to_string();
                                let empty = Value::Object(Default::default());
                                let input = block.get("input").unwrap_or(&empty);
                                let _ = app.emit(
                                    "claude://stream",
                                    StreamEvent::ToolUse {
                                        id: id.clone(),
                                        detail: tool_detail(&name, input),
                                        name,
                                    },
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
            "result" => {
                if let Some(text) = value.get("result").and_then(|v| v.as_str()) {
                    if full.is_empty() {
                        full = text.to_string();
                        let _ = app.emit(
                            "claude://stream",
                            StreamEvent::Delta {
                                id: id.clone(),
                                text: full.clone(),
                            },
                        );
                    }
                }
                if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
                    let _ = app.emit(
                        "claude://stream",
                        StreamEvent::Error {
                            id: id.clone(),
                            message: err.to_string(),
                        },
                    );
                }
            }
            _ => {}
        }
    }

    // Drain the registry entry and reap the child.
    state.running.lock().await.remove(&id);
    let status = child_arc.lock().await.wait().await.map_err(|e| format!("wait: {e}"))?;

    if let Some(handle) = stderr_handle {
        let _ = handle.await;
    }

    if full.trim().is_empty() {
        let stderr_text = stderr_buf.lock().await.clone();
        let stderr_summary = if stderr_text.trim().is_empty() {
            "(stderr empty)".to_string()
        } else {
            stderr_text.trim().to_string()
        };
        let exit_summary = match status.code() {
            Some(c) => format!("exit code {c}"),
            None => "terminated (stopped)".to_string(),
        };
        let message = format!("claude produced no text. {exit_summary}. stderr: {stderr_summary}");
        let _ = app.emit(
            "claude://stream",
            StreamEvent::Error {
                id: id.clone(),
                message: message.clone(),
            },
        );
        return Err(message);
    }

    let _ = app.emit(
        "claude://stream",
        StreamEvent::Done {
            id: id.clone(),
            full_text: full.clone(),
        },
    );
    Ok(full)
}

// ─────────────────────── Project plan file IO ───────────────────────
//
// The plan graph (manifest + per-step markdown specs) lives *inside* each
// project under `.hml/`, so it git-syncs with the code it describes. These two
// commands give the UI scoped read/write access to files under a project root.
// `rel` is always resolved against `root` with a traversal guard, so the UI can
// never reach outside the folder the user registered.

/// Join `rel` onto `root`, refusing absolute paths or any `..` segment so a
/// crafted rel can't escape the project folder.
fn safe_project_path(root: &str, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err("path must be relative to the project".into());
    }
    let mut out = PathBuf::from(root);
    for comp in rel_path.components() {
        use std::path::Component;
        match comp {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("path may not climb out of the project".into());
            }
        }
    }
    Ok(out)
}

/// Read a UTF-8 text file under the project root. Returns `None` when the file
/// does not exist (so callers can treat "no plan yet" as a normal state).
#[tauri::command]
pub fn read_project_text(root: String, rel: String) -> Result<Option<String>, String> {
    let path = safe_project_path(&root, &rel)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Write a UTF-8 text file under the project root, creating parent dirs.
#[tauri::command]
pub fn write_project_text(root: String, rel: String, contents: String) -> Result<(), String> {
    let path = safe_project_path(&root, &rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("write {}: {e}", path.display()))
}

// ─────────────────────────── Project seeding ───────────────────────────

#[derive(Serialize)]
pub struct SeedProject {
    pub name: String,
    pub path: String,
    /// Extra folders (outside `path`) to scan for docs/assets, e.g. build
    /// plans that live at the repo root rather than inside the code folder.
    pub doc_roots: Vec<String>,
}

/// Locate the hauck-marketing-lab repo root by walking up from the working
/// directory (dev runs from app/src-tauri), then falling back to the Desktop.
fn find_repo_root() -> Option<PathBuf> {
    let is_root = |dir: &Path| {
        dir.join("Hauck Command Center (Clients)").is_dir()
            && dir.join("app").join("src-tauri").is_dir()
    };
    if let Ok(cwd) = std::env::current_dir() {
        let mut cur: Option<&Path> = Some(cwd.as_path());
        while let Some(dir) = cur {
            if is_root(dir) {
                return Some(dir.to_path_buf());
            }
            cur = dir.parent();
        }
    }
    if let Some(home) = dirs::home_dir() {
        let cand = home.join("Desktop").join("hauck-marketing-lab");
        if is_root(&cand) {
            return Some(cand);
        }
    }
    None
}

/// The projects to seed the Builder with on first run: the mobile app and the
/// Hauck Marketing Lab desktop app. Only folders that actually exist are
/// returned, so a missing checkout never produces a dead entry.
#[tauri::command]
pub fn builder_default_projects() -> Vec<SeedProject> {
    let Some(root) = find_repo_root() else {
        return Vec::new();
    };
    // Each project: (name, code root, extra doc folders to scan).
    let candidates = [
        (
            "Mobile App",
            root.join("Hauck Command Center (Clients)").join("Mobile App"),
            vec![root
                .join("Hauck Command Center (Clients)")
                .join("Mobile App")
                .join("docs")],
        ),
        (
            "Hauck Marketing Lab",
            root.join("app"),
            vec![root.join("docs").join("build-plans").join("Agency Desktop App")],
        ),
    ];
    candidates
        .into_iter()
        .filter(|(_, p, _)| p.is_dir())
        .map(|(name, p, doc_roots)| SeedProject {
            name: name.to_string(),
            path: p.to_string_lossy().into_owned(),
            doc_roots: doc_roots
                .into_iter()
                .filter(|d| d.is_dir())
                .map(|d| d.to_string_lossy().into_owned())
                .collect(),
        })
        .collect()
}

// ─────────────────────── Project docs + assets ───────────────────────

#[derive(Serialize)]
pub struct ResourceEntry {
    /// Path relative to the project root, e.g. "docs/DEPLOY.md".
    pub rel: String,
    /// File name only, for display.
    pub name: String,
}

#[derive(Serialize)]
pub struct ProjectResources {
    pub docs: Vec<ResourceEntry>,
    pub assets: Vec<ResourceEntry>,
    /// True if a cap was hit and the listing is partial.
    pub truncated: bool,
}

const RES_CAP: usize = 400;
const VISIT_CAP: usize = 60_000;

fn skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "dist"
            | ".git"
            | ".next"
            | "build"
            | "coverage"
            | ".turbo"
            | ".cache"
            | ".vite"
    )
}

fn is_doc(ext: &str) -> bool {
    matches!(ext, "md" | "mdx" | "markdown")
}

fn is_asset(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "ico" | "avif" | "bmp"
    )
}

/// Path of `target` relative to `base`, using `../` to climb out when target
/// lives outside base. So a build-plans folder at the repo root resolves to
/// "../docs/build-plans/..." relative to the project's code folder, which is
/// exactly what claude (cwd = code folder) needs to read it.
fn path_rel(base: &Path, target: &Path) -> String {
    let b: Vec<_> = base.components().collect();
    let t: Vec<_> = target.components().collect();
    let mut i = 0;
    while i < b.len() && i < t.len() && b[i] == t[i] {
        i += 1;
    }
    let mut parts: Vec<String> = Vec::new();
    for _ in i..b.len() {
        parts.push("..".to_string());
    }
    for c in &t[i..] {
        parts.push(c.as_os_str().to_string_lossy().into_owned());
    }
    parts.join("/")
}

/// Walk one root, pushing markdown docs and image assets, with display paths
/// computed relative to `rel_base`. Returns true if a cap was hit.
fn scan_root(
    scan_dir: &Path,
    rel_base: &Path,
    docs: &mut Vec<ResourceEntry>,
    assets: &mut Vec<ResourceEntry>,
    seen: &mut std::collections::HashSet<PathBuf>,
    visited: &mut usize,
) -> bool {
    let mut truncated = false;
    let mut stack: Vec<PathBuf> = vec![scan_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            *visited += 1;
            if *visited > VISIT_CAP {
                return true;
            }
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                if name.starts_with('.') && name != ".claude" {
                    continue;
                }
                if skip_dir(&name) {
                    continue;
                }
                stack.push(p);
                continue;
            }
            if !file_type.is_file() || !seen.insert(p.clone()) {
                continue;
            }
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let rel = path_rel(rel_base, &p);
            if is_doc(&ext) {
                if docs.len() < RES_CAP {
                    docs.push(ResourceEntry { rel, name });
                } else {
                    truncated = true;
                }
            } else if is_asset(&ext) {
                if assets.len() < RES_CAP {
                    assets.push(ResourceEntry { rel, name });
                } else {
                    truncated = true;
                }
            }
        }
    }
    truncated
}

/// Scan a project folder (and any extra doc roots) for markdown docs and image
/// assets, skipping build and dependency directories. Capped so a giant tree
/// can't hang the UI. Display paths are relative to the project root.
#[tauri::command]
pub fn list_project_resources(
    path: String,
    doc_roots: Option<Vec<String>>,
) -> Result<ProjectResources, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let mut docs: Vec<ResourceEntry> = Vec::new();
    let mut assets: Vec<ResourceEntry> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    let mut visited = 0usize;

    let mut truncated = scan_root(&root, &root, &mut docs, &mut assets, &mut seen, &mut visited);
    for extra in doc_roots.unwrap_or_default() {
        let dir = PathBuf::from(&extra);
        if dir.is_dir() {
            truncated |= scan_root(&dir, &root, &mut docs, &mut assets, &mut seen, &mut visited);
        }
    }

    docs.sort_by(|a, b| a.rel.cmp(&b.rel));
    assets.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(ProjectResources {
        docs,
        assets,
        truncated,
    })
}
