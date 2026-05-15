use crate::clients::read_clients_file;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DriveUploadResult {
    pub doc_url: String,
    pub doc_id: Option<String>,
    pub filename: String,
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

fn sanitize_filename(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "Untitled".to_string();
    }
    // Strip characters that would break a Drive filename.
    let cleaned: String = trimmed
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();
    // Drive caps names at 255 chars; we cap lower for sanity.
    if cleaned.len() > 180 {
        cleaned.chars().take(180).collect()
    } else {
        cleaned
    }
}

/// Convert a Drive folder URL (or already-bare ID) into the folder ID portion.
/// Returns the original string if no recognizable ID pattern is found — the
/// downstream agent prompt will then surface a helpful error.
fn extract_folder_id(url: &str) -> String {
    if let Some(rest) = url.split("/folders/").nth(1) {
        let id: String = rest
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        if !id.is_empty() {
            return id;
        }
    }
    url.trim().to_string()
}

fn parse_doc_url(output: &str) -> Option<String> {
    // Look for the sentinel first.
    for line in output.lines().rev() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("DOC_URL:") {
            let url = rest.trim().trim_matches('`').to_string();
            if !url.is_empty() {
                return Some(url);
            }
        }
    }
    // Fallback: any docs URL anywhere in the output.
    for token in output.split_whitespace() {
        let cleaned = token.trim_matches(|c: char| !c.is_ascii_graphic() || matches!(c, ',' | '.' | ')' | '(' | ']' | '['));
        if cleaned.starts_with("https://docs.google.com/document/") {
            return Some(cleaned.to_string());
        }
    }
    None
}

fn parse_doc_id(url: &str) -> Option<String> {
    let rest = url.split("/document/d/").nth(1)?;
    let id: String = rest
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

#[tauri::command]
pub async fn upload_output_to_drive(
    root: String,
    client_slug: String,
    output_path: String,
    filename: String,
) -> Result<DriveUploadResult, String> {
    // 1. Look up client + Drive folder URL.
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

    let folder_id = extract_folder_id(&drive_url);

    // 2. Load the saved markdown body.
    let body = fs::read_to_string(&output_path)
        .map_err(|e| format!("read output file: {e}"))?;
    if body.trim().is_empty() {
        return Err("Saved output file is empty.".to_string());
    }

    let safe_name = sanitize_filename(&filename);

    // 3. Locate claude CLI.
    let claude = locate_claude().ok_or_else(|| {
        "Claude Code not detected on PATH. Install it and log in, then restart.".to_string()
    })?;

    // 4. Build the prompt. One template — semantic HTML so Drive converts it
    //    into a properly styled Google Doc (real heading styles, tables,
    //    lists, bold/italic), no raw markdown leaking through.
    let prompt = format!(
        "You have access to Google Drive tools (mcp__claude_ai_Google_Drive__*).\n\n\
         TASK: Convert the markdown brief below into a clean, well-structured Google Doc \
         inside the client's Drive folder.\n\n\
         CLIENT: {client_name}\n\
         TARGET FOLDER ID: {folder_id}\n\
         TARGET FILENAME: {safe_name}\n\n\
         STEP 1 — Reformat the markdown into semantic HTML following this template:\n\
         - <h1> for the document title (use the filename above as the title)\n\
         - <h2> for major sections, <h3> for subsections\n\
         - <p> for paragraphs (do not wrap headings in <p>)\n\
         - <ul>/<ol>/<li> for lists\n\
         - <table><thead><tbody><tr><th><td> for any tabular data\n\
         - <strong> for key terms, <em> for emphasis\n\
         - <blockquote> for callout/summary boxes (use for any exec-summary or key-takeaway block)\n\
         - <a href=\"...\"> for links\n\
         Do NOT include <html>, <head>, <body>, <style>, <script>, or inline style attributes — \
         Drive will apply its own document styles when converting. Just clean semantic body HTML.\n\n\
         STEP 2 — Call mcp__claude_ai_Google_Drive__create_file with:\n\
         - name: \"{safe_name}\"\n\
         - parent folder: {folder_id}\n\
         - mimeType: application/vnd.google-apps.document  (this tells Drive to convert the upload into a native Google Doc)\n\
         - source content: the HTML you produced in Step 1 (set the source mimeType to text/html so Drive converts it)\n\n\
         STEP 3 — On the FINAL line of your response, emit exactly:\n\
         DOC_URL: <the webViewLink or full Doc URL returned by Drive>\n\
         No other text after that line. No tool-call chatter in the output — only the DOC_URL line is required.\n\n\
         --- MARKDOWN BRIEF BELOW ---\n\n\
         {body}\n",
        client_name = client.name,
        folder_id = folder_id,
        safe_name = safe_name,
        body = body,
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
    let mut out_buf = String::new();
    stdout
        .read_to_string(&mut out_buf)
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

    let doc_url = parse_doc_url(&out_buf).ok_or_else(|| {
        format!(
            "Could not find a Google Doc URL in the agent response. Output was:\n{}",
            out_buf.trim()
        )
    })?;

    let doc_id = parse_doc_id(&doc_url);

    Ok(DriveUploadResult {
        doc_url,
        doc_id,
        filename: safe_name,
    })
}
