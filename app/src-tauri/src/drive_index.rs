use crate::clients::read_clients_file;
use crate::events::{emit_changed, DataKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveIndex {
    pub client: String,
    pub drive_folder_url: Option<String>,
    pub updated_at: String,
    pub body: String,
    pub path: String,
}

/// Drive index location. Canonical (v2): `vault/Clients/<Name>/_drive-index.md`.
/// Falls back to the legacy `media-buying/data/<slug>/_drive-index.md` when
/// the vault file does not yet exist, so the migration can be done safely at
/// any time. Writes go to the canonical vault location.
fn drive_index_path(root: &str, slug: &str) -> PathBuf {
    let vault = crate::vault::vault_root(root);
    let name = client_name_for(root, slug);
    let vault_path = vault.join("Clients").join(&name).join("_drive-index.md");
    if vault_path.exists() {
        return vault_path;
    }
    // Legacy: media-buying/data/<slug>/_drive-index.md
    let legacy = PathBuf::from(root)
        .join("data")
        .join(slug)
        .join("_drive-index.md");
    if legacy.exists() {
        return legacy;
    }
    // Neither exists — return the canonical path so reads can fail cleanly
    // and writes land in the right place.
    vault_path
}

fn drive_index_write_path(root: &str, slug: &str) -> PathBuf {
    let vault = crate::vault::vault_root(root);
    let name = client_name_for(root, slug);
    vault.join("Clients").join(&name).join("_drive-index.md")
}

fn client_name_for(root: &str, slug: &str) -> String {
    match read_clients_file(root) {
        Ok(list) => list
            .into_iter()
            .find(|c| c.slug == slug)
            .map(|c| c.name)
            .unwrap_or_else(|| slug.to_string()),
        Err(_) => slug.to_string(),
    }
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

fn build_command(claude_path: &PathBuf) -> Command {
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

#[tauri::command]
pub fn read_drive_index(root: String, client_slug: String) -> Result<Option<DriveIndex>, String> {
    let path = drive_index_path(&root, &client_slug);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read drive index: {e}"))?;

    // Parse minimal frontmatter: --- ... ---
    let (updated_at, drive_url, body) = if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            let fm = &rest[..end];
            let after = &rest[end + 5..];
            let mut updated = String::new();
            let mut url: Option<String> = None;
            for line in fm.lines() {
                if let Some(v) = line.strip_prefix("updated_at:") {
                    updated = v.trim().trim_matches('"').to_string();
                } else if let Some(v) = line.strip_prefix("drive_folder_url:") {
                    let t = v.trim().trim_matches('"').to_string();
                    if !t.is_empty() && t != "null" {
                        url = Some(t);
                    }
                }
            }
            (updated, url, after.to_string())
        } else {
            (String::new(), None, raw.clone())
        }
    } else {
        (String::new(), None, raw.clone())
    };

    Ok(Some(DriveIndex {
        client: client_slug,
        drive_folder_url: drive_url,
        updated_at,
        body,
        path: path.to_string_lossy().into_owned(),
    }))
}

#[tauri::command]
pub async fn refresh_drive_index(
    app: AppHandle,
    root: String,
    client_slug: String,
) -> Result<DriveIndex, String> {
    // Look up the client + Drive URL
    let clients = read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;

    let drive_url = client
        .drive_folder_url
        .clone()
        .ok_or_else(|| {
            "This client has no Google Drive folder URL. Add one on the Clients page first."
                .to_string()
        })?;

    let claude = locate_claude().ok_or_else(|| {
        "Claude Code not detected on PATH. Install it and log in, then restart.".to_string()
    })?;

    let prompt = format!(
        "You have access to Google Drive tools (mcp__claude_ai_Google_Drive__*). \
         The client \"{name}\" has a Google Drive folder at: {url}\n\n\
         Please:\n\
         1. Use the Drive tools to list the immediate subfolders of that root folder, \
         then read the relevant contents of those subfolders.\n\
         2. Produce a concise context briefing in markdown that future agents can read \
         to quickly understand this client. Cover: \
         brand voice/tone if found, key brand assets available (logos, fonts, photos), \
         products/services, target audience, any past creative or reporting that exists, \
         and anything else important you notice.\n\
         3. Format the output as clean markdown. Start with a single H1 \"# {name} — Client Context\".\n\
         4. IMMEDIATELY after the H1 (before any other section), include a section titled \
         \"## Subfolders\" with a markdown table of the immediate subfolders of the root folder. \
         The table MUST use exactly this format (the folder ID column wrapped in backticks is required \
         — the desktop app parses this table to render sidebar links):\n\n\
         | Subfolder | Folder ID | Notes |\n\
         |---|---|---|\n\
         | Assets | `1AbCdEf...` | brief note |\n\
         | Creatives | `1XyZ...` | brief note |\n\n\
         Use the real folder IDs returned by the Drive list call (each ID is typically 25+ chars, \
         alphanumeric with dashes/underscores). One row per immediate subfolder. \
         If the root has no subfolders, still include the table header with a single row \
         saying the root is empty.\n\
         5. At the very END of your output (after every other section), include a section titled \
         \"## Tree\" containing a single fenced ```json code block with the FULL recursive \
         contents of the root folder. The desktop app parses this to let the user browse \
         folders in-app and open files externally. The JSON shape MUST be exactly:\n\n\
         ```json\n\
         {{\n\
           \"id\": \"<root folder id>\",\n\
           \"name\": \"{name}\",\n\
           \"type\": \"folder\",\n\
           \"children\": [\n\
             {{\n\
               \"id\": \"<subfolder id>\",\n\
               \"name\": \"Assets\",\n\
               \"type\": \"folder\",\n\
               \"children\": [\n\
                 {{ \"id\": \"<file id>\", \"name\": \"logo.png\", \"type\": \"file\", \"mimeType\": \"image/png\", \"url\": \"https://drive.google.com/file/d/<file id>/view\" }}\n\
               ]\n\
             }}\n\
           ]\n\
         }}\n\
         ```\n\n\
         Rules for the tree:\n\
         - Walk EVERY folder reachable from the root, depth-first, no depth limit. \
         Each folder must list its complete `children` array (empty array `[]` if the folder is empty).\n\
         - Every node has `id`, `name`, and `type` (\"folder\" or \"file\"). Folders also have \
         `children`. Files also have `mimeType` and `url` (use the Drive `webViewLink`; if absent, \
         construct `https://drive.google.com/file/d/<id>/view` for binary files or \
         `https://docs.google.com/document/d/<id>/edit` for Google Docs / Sheets / Slides as appropriate).\n\
         - Use the real Drive IDs and names. Do not invent or summarize. Do not include trashed items.\n\
         - Output ONLY the JSON inside the fenced block — no commentary inside the block.\n\
         6. Do not include any tool-call chatter, only the final briefing.\n",
        name = client.name,
        url = drive_url
    );

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
    let mut body = String::new();
    stdout
        .read_to_string(&mut body)
        .await
        .map_err(|e| format!("read stdout: {e}"))?;

    let status = child.wait().await.map_err(|e| format!("wait: {e}"))?;
    if !status.success() {
        let mut err_buf = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            let _ = stderr.read_to_string(&mut err_buf).await;
        }
        return Err(format!(
            "claude -p exited {status}. {}",
            err_buf.trim()
        ));
    }

    let body = body.trim().to_string();
    if body.is_empty() {
        return Err("claude returned an empty response.".to_string());
    }

    let updated_at = chrono::Utc::now().to_rfc3339();
    let frontmatter = format!(
        "---\nclient: {slug}\ndrive_folder_url: \"{url}\"\nupdated_at: \"{ts}\"\n---\n",
        slug = client_slug,
        url = drive_url,
        ts = updated_at,
    );
    let file_body = format!("{frontmatter}\n{body}\n");

    // Refreshes always write to the canonical vault location so the file
    // ends up next to the client's Profile/Memory under vault/Clients/<Name>/.
    let path = drive_index_write_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create client dir: {e}"))?;
    }
    fs::write(&path, &file_body).map_err(|e| format!("write drive index: {e}"))?;

    let path_str = path.to_string_lossy().into_owned();
    emit_changed(
        &app,
        DataKind::Client,
        Some(client_slug.clone()),
        Some(path_str.clone()),
    );

    Ok(DriveIndex {
        client: client_slug,
        drive_folder_url: Some(drive_url),
        updated_at,
        body,
        path: path_str,
    })
}
