use crate::events::{emit_changed, DataKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

/// SOPs now live in a Google Drive folder, not the vault. The app keeps a
/// local cache of the listing + each doc's body so the UI is instant after a
/// refresh.
///
/// Cache layout (inside the media-buying root):
///   data/_sops/index.json     — array of SopSummary
///   data/_sops/<docId>.md     — cached body for a doc
///
/// Refreshes shell out to `claude -p` with the Google Drive MCP tools — the
/// same trick used in drive_index.rs.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SopSummary {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub web_view_link: Option<String>,
    #[serde(default)]
    pub modified_time: Option<String>,
    #[serde(default)]
    pub folder: Option<String>,
    /// True once we've fetched the body and cached it locally.
    #[serde(default)]
    pub cached: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SopFile {
    pub id: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub web_view_link: Option<String>,
    pub fetched_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SopsIndex {
    pub folder_url: Option<String>,
    pub updated_at: Option<String>,
    pub items: Vec<SopSummary>,
}

fn sops_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("data").join("_sops")
}

fn index_path(root: &str) -> PathBuf {
    sops_dir(root).join("index.json")
}

fn body_path(root: &str, doc_id: &str) -> PathBuf {
    // Sanitize doc_id — Drive IDs are safe chars but be defensive.
    let safe: String = doc_id
        .chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' => c,
            _ => '_',
        })
        .collect();
    sops_dir(root).join(format!("{safe}.md"))
}

fn read_index_from_disk(root: &str) -> SopsIndex {
    let p = index_path(root);
    if !p.exists() {
        return SopsIndex {
            folder_url: None,
            updated_at: None,
            items: Vec::new(),
        };
    }
    let raw = match fs::read_to_string(&p) {
        Ok(s) => s,
        Err(_) => {
            return SopsIndex {
                folder_url: None,
                updated_at: None,
                items: Vec::new(),
            }
        }
    };
    let mut idx: SopsIndex = serde_json::from_str(&raw).unwrap_or(SopsIndex {
        folder_url: None,
        updated_at: None,
        items: Vec::new(),
    });
    // Stamp `cached` based on whether the body file exists.
    for item in idx.items.iter_mut() {
        item.cached = body_path(root, &item.id).exists();
    }
    idx
}

fn write_index_to_disk(root: &str, idx: &SopsIndex) -> Result<(), String> {
    let dir = sops_dir(root);
    fs::create_dir_all(&dir).map_err(|e| format!("create sops cache dir: {e}"))?;
    let raw = serde_json::to_string_pretty(idx).map_err(|e| format!("serialize index: {e}"))?;
    fs::write(index_path(root), raw).map_err(|e| format!("write index: {e}"))?;
    Ok(())
}

fn locate_claude() -> Option<PathBuf> {
    if let Ok(p) = which::which("claude") {
        return Some(p);
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        #[cfg(windows)]
        {
            candidates.push(
                home.join("AppData").join("Roaming").join("npm").join("claude.cmd"),
            );
            candidates.push(
                home.join("AppData").join("Roaming").join("npm").join("claude.ps1"),
            );
            candidates.push(
                home.join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("claude")
                    .join("claude.exe"),
            );
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

fn build_command(claude_path: &Path) -> Command {
    #[cfg(windows)]
    {
        let ext = claude_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());
        if matches!(ext.as_deref(), Some("cmd") | Some("bat") | Some("ps1")) {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(claude_path);
            return c;
        }
    }
    Command::new(claude_path)
}

async fn run_claude_with_prompt(prompt: String) -> Result<String, String> {
    let claude = locate_claude().ok_or_else(|| {
        "Claude Code not detected on PATH. Install it and log in, then restart.".to_string()
    })?;
    let mut cmd = build_command(&claude);
    cmd.arg("-p")
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
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let mut out = String::new();
    stdout
        .read_to_string(&mut out)
        .await
        .map_err(|e| format!("read stdout: {e}"))?;
    let status = child.wait().await.map_err(|e| format!("wait: {e}"))?;
    if !status.success() {
        let mut err_buf = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            let _ = stderr.read_to_string(&mut err_buf).await;
        }
        return Err(format!("claude -p exited {status}. {}", err_buf.trim()));
    }
    Ok(out.trim().to_string())
}

/// Strip a markdown ```json … ``` fence (or plain ``` … ```) if Claude wrapped it.
fn strip_code_fence(s: &str) -> &str {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        let rest = rest.trim_start_matches('\n');
        if let Some(end) = rest.rfind("```") {
            return rest[..end].trim_end();
        }
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        let rest = rest.trim_start_matches('\n');
        if let Some(end) = rest.rfind("```") {
            return rest[..end].trim_end();
        }
    }
    trimmed
}

#[tauri::command]
pub fn list_sops(root: String) -> Result<SopsIndex, String> {
    Ok(read_index_from_disk(&root))
}

#[tauri::command]
pub async fn refresh_sops_index(
    app: AppHandle,
    root: String,
    folder_url: String,
) -> Result<SopsIndex, String> {
    let url = folder_url.trim().to_string();
    if url.is_empty() {
        return Err("No SOPs folder URL set. Add one in Settings.".to_string());
    }

    let prompt = format!(
        "You have access to Google Drive tools (mcp__claude_ai_Google_Drive__*).\n\n\
         The agency's SOPs live in the Google Drive folder at: {url}\n\n\
         Please:\n\
         1. Use the Drive search/list tools to enumerate every file in that folder. Recurse one level into any immediate sub-folders so docs inside them are included. Do not emit folder entries themselves, only files.\n\
         2. Output ONLY a JSON array (no prose, no markdown code fences) with one object per file, in this exact shape:\n   {{ \"id\": \"<drive file id>\", \"title\": \"<file name without extension>\", \"mimeType\": \"<mime type>\", \"webViewLink\": \"<url to open in Drive>\", \"modifiedTime\": \"<ISO 8601 timestamp>\", \"folder\": \"<sub-folder name if any, otherwise empty string>\" }}\n\
         3. Sort by title ascending. Return [] if the folder is empty.\n\
         4. Do not include any tool-call chatter — output the raw JSON array and nothing else.\n"
    );

    let raw = run_claude_with_prompt(prompt).await?;
    let cleaned = strip_code_fence(&raw);
    let items: Vec<SopSummary> = serde_json::from_str(cleaned).map_err(|e| {
        format!(
            "Claude did not return a valid JSON array. Parse error: {e}. Raw output (first 500 chars): {}",
            &raw.chars().take(500).collect::<String>()
        )
    })?;

    let idx = SopsIndex {
        folder_url: Some(url),
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
        items,
    };
    write_index_to_disk(&root, &idx)?;

    // Re-read so `cached` flags are populated from disk.
    let final_idx = read_index_from_disk(&root);

    emit_changed(
        &app,
        DataKind::Vault,
        None,
        Some(index_path(&root).to_string_lossy().into_owned()),
    );

    Ok(SopsIndex {
        folder_url: final_idx.folder_url.or(idx.folder_url),
        updated_at: final_idx.updated_at.or(idx.updated_at),
        items: final_idx.items,
    })
}

#[tauri::command]
pub fn read_sop(root: String, sop_id: String) -> Result<Option<SopFile>, String> {
    let idx = read_index_from_disk(&root);
    let Some(item) = idx.items.iter().find(|i| i.id == sop_id) else {
        return Err(format!("SOP not found in index: {sop_id}"));
    };
    let p = body_path(&root, &sop_id);
    if !p.exists() {
        return Ok(None);
    }
    let body = fs::read_to_string(&p).map_err(|e| format!("read sop body: {e}"))?;
    let fetched_at = fs::metadata(&p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    Ok(Some(SopFile {
        id: sop_id,
        title: item.title.clone(),
        body,
        web_view_link: item.web_view_link.clone(),
        fetched_at,
    }))
}

#[tauri::command]
pub async fn fetch_sop(
    app: AppHandle,
    root: String,
    sop_id: String,
) -> Result<SopFile, String> {
    let idx = read_index_from_disk(&root);
    let item = idx
        .items
        .iter()
        .find(|i| i.id == sop_id)
        .cloned()
        .ok_or_else(|| {
            format!(
                "SOP not in cached index — refresh the list from Drive first. id: {sop_id}"
            )
        })?;

    let prompt = format!(
        "You have access to Google Drive tools (mcp__claude_ai_Google_Drive__*).\n\n\
         Fetch the full content of Drive file id: {id}\n\
         Title (for context): {title}\n\
         MIME type: {mime}\n\n\
         Instructions:\n\
         1. Use the Drive tools (read_file_content / download_file_content / get_file_metadata as appropriate) to retrieve the document's contents. For Google Docs, return clean markdown that preserves headings, lists, checkboxes, links, and bold/italic formatting. For plain markdown or text files, return the content verbatim.\n\
         2. Output ONLY the document content. Do not wrap it in a code fence. Do not add any preamble (\"Here is the content\"), tool-call chatter, or trailing notes. Start directly with the doc's first line.\n",
        id = sop_id,
        title = item.title,
        mime = item.mime_type.as_deref().unwrap_or("unknown"),
    );

    let body = run_claude_with_prompt(prompt).await?;
    let cleaned = strip_code_fence(&body).to_string();
    if cleaned.is_empty() {
        return Err("Claude returned an empty document body.".to_string());
    }

    let dir = sops_dir(&root);
    fs::create_dir_all(&dir).map_err(|e| format!("create cache dir: {e}"))?;
    let p = body_path(&root, &sop_id);
    fs::write(&p, &cleaned).map_err(|e| format!("write sop body: {e}"))?;

    emit_changed(
        &app,
        DataKind::Vault,
        None,
        Some(p.to_string_lossy().into_owned()),
    );

    Ok(SopFile {
        id: sop_id,
        title: item.title,
        body: cleaned,
        web_view_link: item.web_view_link,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn clear_sop_cache(app: AppHandle, root: String, sop_id: String) -> Result<(), String> {
    let p = body_path(&root, &sop_id);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("remove cached body: {e}"))?;
    }
    emit_changed(
        &app,
        DataKind::Vault,
        None,
        Some(p.to_string_lossy().into_owned()),
    );
    Ok(())
}
