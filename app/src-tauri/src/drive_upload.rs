use crate::client_docs;
use crate::clients::{read_clients_file, DocFolderTarget};
use crate::drive_api::{create_google_doc_from_html, drive_delete_file};
use crate::events::{emit_changed, DataKind};
use chrono::Utc;
use pulldown_cmark::{html as cmark_html, Options, Parser};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::AppHandle;
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
    // Match both native Google Doc URLs (docs.google.com/document/d/<id>) and
    // generic Drive file URLs (drive.google.com/file/d/<id>). The latter
    // shows up when the MCP uploads without triggering conversion; we still
    // want the file ID so delete + open + future retries can target it.
    let needles = ["/document/d/", "/file/d/", "/spreadsheets/d/", "/presentation/d/"];
    for needle in &needles {
        if let Some(rest) = url.split(needle).nth(1) {
            let id: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
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

// =========================================================================
// Doc-system push / pull
// =========================================================================
//
// These commands operate on the per-client doc store (see client_docs.rs)
// rather than one-shot form output. Push converts the doc body into a
// native Google Doc, then deletes the prior version's Doc via the Drive
// REST API helper in drive_api.rs. Pull reads the current Drive Doc back
// into the local markdown body.

/// Resolve the Drive folder ID a doc should be pushed into.
/// Order of precedence: per-doc override > client default for kind > client
/// root drive folder. Returns the resolved folder ID plus a human label for
/// the frontmatter (so future pulls / UIs can display it).
fn resolve_target_folder(
    fm: &client_docs::DocFrontmatter,
    client: &crate::clients::ClientEntry,
) -> Result<(String, Option<String>), String> {
    if let Some(id) = fm.drive_folder_id.as_ref().filter(|s| !s.trim().is_empty()) {
        return Ok((id.clone(), fm.drive_folder_name.clone()));
    }
    if let Some(defaults) = client.doc_folder_defaults.as_ref() {
        let target = match fm.kind.as_str() {
            "ad-copy" => defaults.ad_copy.as_ref(),
            "brief" => defaults.brief.as_ref(),
            "notes" => defaults.notes.as_ref(),
            "report" => defaults.report.as_ref(),
            "other" => defaults.other.as_ref(),
            _ => None,
        };
        if let Some(t) = target {
            if !t.id.trim().is_empty() {
                return Ok((t.id.clone(), Some(t.name.clone())));
            }
        }
    }
    let url = client
        .drive_folder_url
        .as_ref()
        .ok_or_else(|| {
            "This client has no Google Drive folder URL and no default folder for this kind. \
             Set a folder default in the Documents tab first."
                .to_string()
        })?;
    let id = extract_folder_id(url);
    if id.is_empty() {
        return Err(
            "Client's Drive folder URL could not be parsed into a folder ID.".to_string(),
        );
    }
    Ok((id, None))
}

#[tauri::command]
pub async fn push_client_doc_to_drive(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
) -> Result<client_docs::DocSummary, String> {
    // 1. Resolve paths and load the doc.
    let dir = client_docs::docs_dir(&root, &client_slug)?;
    let path = client_docs::find_doc_path(&dir, &doc_id)?;
    let (mut fm, body) = client_docs::read_doc_file(&path)?;
    if body.trim().is_empty() {
        return Err("Document body is empty. Add content before pushing.".to_string());
    }

    // 2. Load the client and resolve the target Drive folder.
    let clients = read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;
    let (folder_id, folder_name) = resolve_target_folder(&fm, client)?;

    // 3. Stash the old Drive file ID (if any) so we can delete it after the
    //    new Doc lands. Capture before mutating the frontmatter.
    let old_drive_file_id = fm.current_drive_file_id.clone();
    let old_drive_url = fm.current_drive_url.clone();
    let old_version = fm.current_version;
    let old_synced_at = fm.synced_at.clone();
    let old_folder_id = fm.drive_folder_id.clone();
    let old_folder_name = fm.drive_folder_name.clone();

    // 4. Convert markdown body to semantic HTML in-process (no LLM round-trip).
    //    pulldown-cmark with GFM tables / strikethrough / task lists / footnotes
    //    covers everything we render in the editor preview.
    let safe_name = sanitize_filename(&fm.title);
    let html = markdown_to_html(&fm.title, &body);

    // 5. Direct multipart upload to Drive. Drive does the HTML to Google Doc
    //    conversion server-side. No MCP, no claude -p.
    let created = create_google_doc_from_html(&app, &safe_name, &folder_id, &html).await?;
    let new_drive_file_id = created.file_id.clone();
    let new_doc_url = created.web_view_link.clone();

    // 6. Best-effort delete the previous Drive Doc. Failure does not abort
    //    the push; it just lands the old ID in unswept_orphans for later.
    let mut delete_failure: Option<String> = None;
    if let Some(ref old_id) = old_drive_file_id {
        if !old_id.trim().is_empty() && old_id != &new_drive_file_id {
            match drive_delete_file(app.clone(), old_id.clone()).await {
                Ok(_) => {}
                Err(e) => {
                    delete_failure = Some(e);
                }
            }
        }
    }

    // 7. Update frontmatter atomically: archive old version, append orphan
    //    on delete failure, set new current_*.
    if old_drive_file_id.is_some() {
        let mut entry = serde_yaml::Mapping::new();
        entry.insert(
            serde_yaml::Value::String("drive_file_id".to_string()),
            serde_yaml::Value::String(old_drive_file_id.clone().unwrap_or_default()),
        );
        if let Some(url) = old_drive_url {
            entry.insert(
                serde_yaml::Value::String("drive_url".to_string()),
                serde_yaml::Value::String(url),
            );
        }
        entry.insert(
            serde_yaml::Value::String("version".to_string()),
            serde_yaml::Value::Number(serde_yaml::Number::from(old_version)),
        );
        if let Some(at) = old_synced_at {
            entry.insert(
                serde_yaml::Value::String("pushed_at".to_string()),
                serde_yaml::Value::String(at),
            );
        }
        entry.insert(
            serde_yaml::Value::String("swept".to_string()),
            serde_yaml::Value::Bool(delete_failure.is_none()),
        );
        if let Some(folder_id) = old_folder_id {
            entry.insert(
                serde_yaml::Value::String("drive_folder_id".to_string()),
                serde_yaml::Value::String(folder_id),
            );
        }
        if let Some(folder_name) = old_folder_name {
            entry.insert(
                serde_yaml::Value::String("drive_folder_name".to_string()),
                serde_yaml::Value::String(folder_name),
            );
        }
        // Newest first.
        fm.previous_versions
            .insert(0, serde_yaml::Value::Mapping(entry));
    }

    if let (Some(orphan_id), Some(reason)) = (old_drive_file_id, delete_failure.as_ref()) {
        let mut orphan = serde_yaml::Mapping::new();
        orphan.insert(
            serde_yaml::Value::String("drive_file_id".to_string()),
            serde_yaml::Value::String(orphan_id),
        );
        orphan.insert(
            serde_yaml::Value::String("reason".to_string()),
            serde_yaml::Value::String(reason.clone()),
        );
        orphan.insert(
            serde_yaml::Value::String("recorded_at".to_string()),
            serde_yaml::Value::String(Utc::now().to_rfc3339()),
        );
        fm.unswept_orphans
            .push(serde_yaml::Value::Mapping(orphan));
    }

    let now = Utc::now().to_rfc3339();
    fm.current_drive_file_id = Some(new_drive_file_id);
    fm.current_drive_url = Some(new_doc_url);
    fm.current_version = fm.current_version.saturating_add(1);
    fm.synced_at = Some(now.clone());
    fm.synced_content_hash = Some(client_docs::sha256_hex(&body));
    fm.drive_folder_id = Some(folder_id);
    if let Some(name) = folder_name {
        fm.drive_folder_name = Some(name);
    }
    fm.updated_at = now;

    let contents = client_docs::serialize_doc(&fm, &body)?;
    client_docs::atomic_write(&path, &contents)?;

    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(client_docs::build_summary(&fm, &body))
}

#[tauri::command]
pub async fn pull_client_doc_from_drive(
    app: AppHandle,
    root: String,
    client_slug: String,
    doc_id: String,
    create_backup: bool,
) -> Result<client_docs::ClientDoc, String> {
    let dir = client_docs::docs_dir(&root, &client_slug)?;
    let path = client_docs::find_doc_path(&dir, &doc_id)?;
    let (mut fm, body) = client_docs::read_doc_file(&path)?;

    let file_id = fm
        .current_drive_file_id
        .clone()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            "Nothing to pull: this doc has not been pushed to Drive yet.".to_string()
        })?;

    // Optional local backup of the body before overwrite.
    if create_backup {
        let backup_dir = dir.join(".backup");
        if let Err(e) = fs::create_dir_all(&backup_dir) {
            return Err(format!("create backup dir: {e}"));
        }
        let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let backup_path = backup_dir.join(format!("{}-{}.md", fm.id, stamp));
        if let Err(e) = fs::write(&backup_path, &body) {
            return Err(format!("write backup: {e}"));
        }
    }

    let prompt = format!(
        "You have access to Google Drive tools (mcp__claude_ai_Google_Drive__*).\n\n\
         TASK: Read the natural-language text of a single Google Doc and return its body.\n\n\
         FILE ID: {file_id}\n\n\
         STEP 1 - Call mcp__claude_ai_Google_Drive__read_file_content with that file ID.\n\
         STEP 2 - Emit the doc body as plain markdown between sentinel lines, exactly:\n\n\
         <BODY_START>\n\
         <the body, with normal newlines>\n\
         <BODY_END>\n\n\
         Nothing before <BODY_START> and nothing after <BODY_END>. No tool-call chatter, no commentary."
    );

    let raw = run_claude_raw(&prompt).await?;
    let new_body = extract_body_sentinels(&raw).ok_or_else(|| {
        format!(
            "Could not find <BODY_START>/<BODY_END> sentinels in the agent response. Output was:\n{}",
            raw.trim()
        )
    })?;

    let now = Utc::now().to_rfc3339();
    fm.synced_at = Some(now.clone());
    fm.synced_content_hash = Some(client_docs::sha256_hex(&new_body));
    fm.updated_at = now;

    let contents = client_docs::serialize_doc(&fm, &new_body)?;
    client_docs::atomic_write(&path, &contents)?;

    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(client_docs::ClientDoc {
        summary: client_docs::build_summary(&fm, &new_body),
        body: new_body,
    })
}

// =========================================================================
// Internal helpers shared by push / pull
// =========================================================================

/// Spawn `claude -p`, write the prompt to stdin, return the captured stdout.
async fn run_claude_raw(prompt: &str) -> Result<String, String> {
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
        let p = prompt.to_string();
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
        return Err(format!("claude -p exited {status}. {}", err_buf.trim()));
    }
    Ok(out_buf)
}

/// Convert a markdown body into the semantic HTML Drive expects for clean
/// Google Doc conversion. Prepends an <h1> with the document title so the
/// resulting Doc has a real title heading, then the body. Uses GFM-ish
/// pulldown-cmark options (tables, strikethrough, task lists, smart punct).
fn markdown_to_html(title: &str, body: &str) -> String {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(body, opts);
    let mut body_html = String::with_capacity(body.len() * 2);
    cmark_html::push_html(&mut body_html, parser);

    let escaped_title = title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");

    let mut out = String::with_capacity(body_html.len() + escaped_title.len() + 32);
    out.push_str("<h1>");
    out.push_str(&escaped_title);
    out.push_str("</h1>\n");
    out.push_str(&body_html);
    out
}

/// Find content between `<BODY_START>` and `<BODY_END>` sentinels. Tolerant
/// of leading/trailing whitespace around the markers themselves.
fn extract_body_sentinels(output: &str) -> Option<String> {
    let start_idx = output.find("<BODY_START>")?;
    let after_start = &output[start_idx + "<BODY_START>".len()..];
    let end_idx = after_start.find("<BODY_END>")?;
    let inner = &after_start[..end_idx];
    Some(inner.trim_matches('\n').to_string())
}

// =========================================================================
// Ads Sequence auto-push
// =========================================================================
//
// One Tauri command per save in the wizard. For text steps (audience-research,
// creative-brief, hooks, ad-copy, optimizer) this:
//
//   1. Reads the saved vault note body the wizard already wrote.
//   2. Resolves the target Drive subfolder via the precedence chain:
//        sequence_folder_defaults[step_id]
//          → doc_folder_defaults[mapped kind]
//          → client root drive_folder_url.
//   3. Creates (or updates) a per-client Doc record in `vault/.../Docs/` so
//      the file shows up in the standard Documents tab too.
//   4. Pushes that Doc to Drive via the existing `push_client_doc_to_drive`
//      pipeline (semantic-HTML → multipart → native Google Doc).
//
// Binary steps (ad-creative, structure) go through `drive_api` directly;
// they don't pass through this function.

/// Map a SequenceStepId to its DocKind. Used to pick a fallback folder when
/// `sequence_folder_defaults` is unset for the step.
fn step_to_doc_kind(step_id: &str) -> &'static str {
    match step_id {
        "audience-research" => "notes",
        "creative-brief" => "brief",
        "hooks" => "ad-copy",
        "ad-copy" => "ad-copy",
        "optimizer" => "notes",
        // ad-creative / structure are binary and don't flow through here, but
        // keep a sane fallback so a future text-mode push doesn't crash.
        _ => "other",
    }
}

/// Resolve the folder for an Ads Sequence step push, honouring the override
/// before any per-client default.
fn resolve_sequence_folder(
    step_id: &str,
    override_target: Option<&DocFolderTarget>,
    client: &crate::clients::ClientEntry,
) -> Result<(String, Option<String>), String> {
    if let Some(t) = override_target {
        let id = t.id.trim();
        if !id.is_empty() {
            return Ok((id.to_string(), Some(t.name.clone())));
        }
    }
    if let Some(defaults) = client.sequence_folder_defaults.as_ref() {
        let target = match step_id {
            "audience-research" => defaults.audience_research.as_ref(),
            "creative-brief" => defaults.creative_brief.as_ref(),
            "hooks" => defaults.hooks.as_ref(),
            "ad-copy" => defaults.ad_copy.as_ref(),
            "ad-creative" => defaults.ad_creative.as_ref(),
            "structure" => defaults.structure.as_ref(),
            "optimizer" => defaults.optimizer.as_ref(),
            _ => None,
        };
        if let Some(t) = target {
            if !t.id.trim().is_empty() {
                return Ok((t.id.clone(), Some(t.name.clone())));
            }
        }
    }
    if let Some(defaults) = client.doc_folder_defaults.as_ref() {
        let kind = step_to_doc_kind(step_id);
        let target = match kind {
            "ad-copy" => defaults.ad_copy.as_ref(),
            "brief" => defaults.brief.as_ref(),
            "notes" => defaults.notes.as_ref(),
            "report" => defaults.report.as_ref(),
            "other" => defaults.other.as_ref(),
            _ => None,
        };
        if let Some(t) = target {
            if !t.id.trim().is_empty() {
                return Ok((t.id.clone(), Some(t.name.clone())));
            }
        }
    }
    let url = client
        .drive_folder_url
        .as_ref()
        .ok_or_else(|| {
            "This client has no Drive folder configured. Open the Ads Sequence Drive folders panel and pick one for this step."
                .to_string()
        })?;
    let id = extract_folder_id(url);
    if id.is_empty() {
        return Err("Client Drive folder URL could not be parsed.".to_string());
    }
    Ok((id, None))
}

/// Strip the YAML frontmatter from a vault note body. The wizard's
/// generator outputs typically look like:
///
///   ---
///   key: value
///   ---
///
///   # Heading
///   ...
///
/// We only push the body below the frontmatter to Drive so the resulting
/// Doc doesn't open with a wall of YAML.
fn strip_vault_frontmatter(raw: &str) -> &str {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return raw;
    }
    let after_first = &trimmed[3..];
    if let Some(end_rel) = after_first.find("\n---") {
        let after_end = &after_first[end_rel + 4..];
        // Drop the trailing newline after the closing fence if there is one.
        return after_end.trim_start_matches(['\r', '\n'].as_ref());
    }
    raw
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SequencePushResult {
    pub doc_id: String,
    pub drive_url: String,
    pub drive_file_id: String,
    pub folder_id: String,
    pub folder_name: Option<String>,
}

/// Push the saved output of a single Ads Sequence step to Drive. Idempotent:
/// re-calling for the same step replaces the prior Doc (existing
/// `push_client_doc_to_drive` deletes the old version).
///
/// Frontend contract:
///   - `vault_path` is the absolute path the wizard's `handleSaved` already has.
///   - `title` is the human-readable Doc title (e.g. "Willis Windows · Hooks").
///   - `folder_override` optionally pins this push to a specific folder.
#[tauri::command]
pub async fn push_sequence_step_to_drive(
    app: AppHandle,
    root: String,
    client_slug: String,
    step_id: String,
    vault_path: String,
    title: String,
    folder_override: Option<DocFolderTarget>,
) -> Result<SequencePushResult, String> {
    // 1. Load + validate the saved step output.
    let raw = fs::read_to_string(&vault_path)
        .map_err(|e| format!("read vault note {vault_path}: {e}"))?;
    let body = strip_vault_frontmatter(&raw).trim().to_string();
    if body.is_empty() {
        return Err("Saved step output is empty.".to_string());
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Push title cannot be empty.".to_string());
    }

    // 2. Load client + resolve target folder.
    let clients = read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;
    let (folder_id, folder_name) =
        resolve_sequence_folder(&step_id, folder_override.as_ref(), client)?;

    // 3. Find or create the per-client Doc backing this step. The Doc id is
    //    derived from step_id so re-pushing the same step lands on the same
    //    record. Look up by id first; create otherwise.
    let kind = step_to_doc_kind(&step_id).to_string();
    let dir = client_docs::docs_dir(&root, &client_slug)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create docs dir: {e}"))?;

    let summaries =
        client_docs::list_client_docs(root.clone(), client_slug.clone())?;
    let doc_id = match summaries
        .iter()
        .find(|s| s.kind == kind && s.title == title)
    {
        Some(existing) => {
            // Update body in place so the doc reflects the freshest output.
            client_docs::update_client_doc_body(
                app.clone(),
                root.clone(),
                client_slug.clone(),
                existing.id.clone(),
                body.clone(),
            )?;
            existing.id.clone()
        }
        None => {
            let payload = client_docs::CreateDocPayload {
                title: title.clone(),
                kind: kind.clone(),
                body: Some(body.clone()),
                drive_folder_id: Some(folder_id.clone()),
                drive_folder_name: folder_name.clone(),
            };
            let created = client_docs::create_client_doc(
                app.clone(),
                root.clone(),
                client_slug.clone(),
                payload,
            )?;
            created.summary.id
        }
    };

    // 4. Pin this doc's target folder to the resolved one so the existing
    //    push pipeline uses it (overrides anything stale on the doc).
    client_docs::set_client_doc_target_folder(
        app.clone(),
        root.clone(),
        client_slug.clone(),
        doc_id.clone(),
        Some(folder_id.clone()),
        folder_name.clone(),
    )?;

    // 5. Push via the existing pipeline.
    let summary =
        push_client_doc_to_drive(app, root, client_slug, doc_id.clone()).await?;

    let drive_url = summary
        .current_drive_url
        .ok_or_else(|| "Push reported success but no Drive URL was returned.".to_string())?;
    let drive_file_id = summary
        .current_drive_file_id
        .ok_or_else(|| "Push reported success but no Drive file id was returned.".to_string())?;

    Ok(SequencePushResult {
        doc_id,
        drive_url,
        drive_file_id,
        folder_id,
        folder_name,
    })
}
