use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeCheck {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    Started { id: String },
    Delta { id: String, text: String },
    Done { id: String, full_text: String },
    Error { id: String, message: String },
}

fn locate_claude() -> Option<PathBuf> {
    if let Ok(p) = which::which("claude") {
        return Some(p);
    }
    // Fallbacks for common install locations
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

fn build_command(claude_path: &PathBuf) -> Command {
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW — prevents the child from trying to attach to a
        // console when the Tauri GUI process has none. Without this, spawning
        // cmd.exe from a windowed app can fail with STATUS_DLL_INIT_FAILED
        // (0xC0000142) before the child can even print to stderr.
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

#[tauri::command]
pub async fn check_claude() -> ClaudeCheck {
    let Some(path) = locate_claude() else {
        return ClaudeCheck {
            found: false,
            path: None,
            version: None,
            error: Some(
                "Claude Code not detected on PATH. Install from https://claude.ai/code and log in, then restart the app.".to_string(),
            ),
        };
    };

    let mut cmd = build_command(&path);
    cmd.arg("--version");
    let output = cmd.output().await;
    match output {
        Ok(o) if o.status.success() => ClaudeCheck {
            found: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(String::from_utf8_lossy(&o.stdout).trim().to_string()),
            error: None,
        },
        Ok(o) => ClaudeCheck {
            found: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: None,
            error: Some(format!(
                "claude --version exited {}: {}",
                o.status,
                String::from_utf8_lossy(&o.stderr)
            )),
        },
        Err(e) => ClaudeCheck {
            found: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: None,
            error: Some(format!("failed to invoke claude: {e}")),
        },
    }
}

#[tauri::command]
pub async fn invoke_claude(
    app: AppHandle,
    id: String,
    prompt: String,
    // Optional value for claude's `--tools` flag. `Some("")` disables every
    // built-in tool (Skill, Bash, Read, Write, WebFetch, ...), which locks a
    // persona chat to pure text generation so it can't reach other skills.
    // `None` (the default for most callers) leaves the full toolset available.
    tools: Option<String>,
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

    let _ = app.emit(
        "claude://stream",
        StreamEvent::Started { id: id.clone() },
    );

    let mut cmd = build_command(&path);
    cmd.arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose");
    if let Some(t) = tools.as_deref() {
        // Pass through even when empty: `--tools ""` is claude's documented way
        // to disable all built-in tools.
        cmd.arg("--tools").arg(t);
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

    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_handle = stderr.map(|stderr| {
        let buf = Arc::clone(&stderr_buf);
        let app_for_err = app.clone();
        let id_for_err = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let mut b = buf.lock().await;
                b.push_str(&line);
                b.push('\n');
            }
            let final_buf = buf.lock().await.clone();
            if !final_buf.trim().is_empty() {
                let _ = app_for_err.emit(
                    "claude://stream",
                    StreamEvent::Error {
                        id: id_for_err.clone(),
                        message: final_buf,
                    },
                );
            }
        })
    });

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
                                    "claude://stream",
                                    StreamEvent::Delta {
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

    let status = child.wait().await.map_err(|e| format!("wait: {e}"))?;

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
            None => format!("terminated without exit code ({status})"),
        };
        let message = format!(
            "claude -p produced no text. {exit_summary}. stderr: {stderr_summary}"
        );
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
