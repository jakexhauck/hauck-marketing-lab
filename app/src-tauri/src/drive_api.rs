// Direct Google Drive REST API calls. Used for operations the Drive MCP
// does not expose (delete, in particular). OAuth tokens are managed by
// google_calendar.rs, this module just borrows an access token.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use serde::Serialize;
use serde_json::json;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

use crate::client_docs;
use crate::events::{emit_changed, DataKind};
use crate::google_calendar::google_access_token;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriveDeleteOutcome {
    pub file_id: String,
    /// True if Drive returned 404 (file already deleted). The call is
    /// idempotent: caller can treat this as success.
    pub already_gone: bool,
}

fn is_valid_file_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
pub async fn drive_delete_file(
    app: AppHandle,
    file_id: String,
) -> Result<DriveDeleteOutcome, String> {
    if !is_valid_file_id(&file_id) {
        return Err(format!(
            "invalid Drive file id: {file_id:?} (must be non-empty, URL-safe: alphanumeric, '-', '_')"
        ));
    }

    let token = google_access_token(&app).await?;
    let client = reqwest::Client::new();
    let url = format!("https://www.googleapis.com/drive/v3/files/{file_id}");

    let resp = client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("drive delete request: {e}"))?;

    let status = resp.status();
    match status.as_u16() {
        204 => Ok(DriveDeleteOutcome {
            file_id,
            already_gone: false,
        }),
        404 => Ok(DriveDeleteOutcome {
            file_id,
            already_gone: true,
        }),
        401 => Err(
            "Google authentication expired or missing the Drive scope. Reconnect via Settings > Google Calendar."
                .to_string(),
        ),
        403 => Err(
            "Drive denied the delete. The file may have been created outside this app and is not in this app's drive.file scope."
                .to_string(),
        ),
        _ => {
            let body = resp.text().await.unwrap_or_default();
            Err(format!("drive delete failed ({status}): {body}"))
        }
    }
}

/// Result of uploading an HTML body as a native Google Doc.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreatedDoc {
    pub file_id: String,
    pub web_view_link: String,
    pub mime_type: String,
}

fn boundary() -> String {
    let mut bytes = [0u8; 18];
    rand::thread_rng().fill_bytes(&mut bytes);
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("hml_drive_{hex}")
}

/// Create a NATIVE Google Doc inside `parent_folder_id` from the given HTML
/// body. Uses a multipart upload so Drive converts text/html into
/// application/vnd.google-apps.document server-side. Returns the created
/// file's ID, web view link, and resolved mimeType (which MUST be
/// application/vnd.google-apps.document for this to be a success).
pub(crate) async fn create_google_doc_from_html(
    app: &AppHandle,
    title: &str,
    parent_folder_id: &str,
    html: &str,
) -> Result<CreatedDoc, String> {
    if title.trim().is_empty() {
        return Err("create_google_doc_from_html: empty title".into());
    }
    if !is_valid_file_id(parent_folder_id) {
        return Err(format!(
            "invalid parent folder id: {parent_folder_id:?}"
        ));
    }

    let token = google_access_token(app).await?;
    let bound = boundary();
    let metadata = json!({
        "name": title,
        "parents": [parent_folder_id],
        "mimeType": "application/vnd.google-apps.document",
    })
    .to_string();

    // Build the multipart/related body manually. Drive accepts:
    //   --boundary
    //   Content-Type: application/json; charset=UTF-8
    //
    //   <metadata json>
    //   --boundary
    //   Content-Type: text/html; charset=UTF-8
    //
    //   <html body>
    //   --boundary--
    let mut body = String::with_capacity(html.len() + metadata.len() + 256);
    body.push_str("--");
    body.push_str(&bound);
    body.push_str("\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n");
    body.push_str(&metadata);
    body.push_str("\r\n--");
    body.push_str(&bound);
    body.push_str("\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n");
    body.push_str(html);
    body.push_str("\r\n--");
    body.push_str(&bound);
    body.push_str("--\r\n");

    let client = reqwest::Client::new();
    let resp = client
        .post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=false&fields=id,name,mimeType,webViewLink",
        )
        .bearer_auth(&token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={bound}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("drive upload request: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "Google authentication expired or missing the Drive scope. Reconnect via Settings > Google Calendar.".to_string(),
            403 => format!(
                "Drive denied the upload (403). The target folder may be outside this app's drive.file scope. Body: {text}"
            ),
            404 => format!(
                "Drive folder not found (404). Check the folder ID for this client. Body: {text}"
            ),
            _ => format!("drive upload failed ({status}): {text}"),
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        format!("drive upload returned non-JSON success: {e}. Body: {text}")
    })?;
    let file_id = parsed
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("drive upload response missing 'id'. Body: {text}"))?
        .to_string();
    let mime_type = parsed
        .get("mimeType")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if mime_type != "application/vnd.google-apps.document" {
        return Err(format!(
            "Drive accepted the upload but did NOT convert it to a native Google Doc \
             (mimeType '{mime_type}'). Aborting before saving locally. Body: {text}"
        ));
    }
    let web_view_link = parsed
        .get("webViewLink")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://docs.google.com/document/d/{file_id}/edit"));

    Ok(CreatedDoc {
        file_id,
        web_view_link,
        mime_type,
    })
}

/// Drive-state classification for a single file ID.
enum DriveState {
    Present,
    Deleted, // 404 or trashed=true
    Unknown, // network/auth/other error; do NOT delete locally
}

async fn classify_drive_file(token: &str, file_id: &str) -> DriveState {
    if !is_valid_file_id(file_id) {
        return DriveState::Unknown;
    }
    let client = reqwest::Client::new();
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,trashed"
    );
    let resp = match client.get(&url).bearer_auth(token).send().await {
        Ok(r) => r,
        Err(_) => return DriveState::Unknown,
    };
    match resp.status().as_u16() {
        200 => {
            let body = match resp.text().await {
                Ok(b) => b,
                Err(_) => return DriveState::Unknown,
            };
            let parsed: serde_json::Value = match serde_json::from_str(&body) {
                Ok(p) => p,
                Err(_) => return DriveState::Unknown,
            };
            let trashed = parsed.get("trashed").and_then(|v| v.as_bool()).unwrap_or(false);
            if trashed {
                DriveState::Deleted
            } else {
                DriveState::Present
            }
        }
        404 => DriveState::Deleted,
        _ => DriveState::Unknown,
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SweepResult {
    /// Doc IDs that were removed locally because Drive no longer has them.
    pub removed_doc_ids: Vec<String>,
    /// Docs we could not classify (auth lapse, network, etc.). Caller can
    /// surface as a soft warning.
    pub skipped_doc_ids: Vec<String>,
    /// Docs that are still present on Drive (no action taken).
    pub still_present_doc_ids: Vec<String>,
}

/// For every doc in the client's vault that has a `current_drive_file_id`,
/// ask Drive whether the file still exists. Locally delete the markdown
/// file when Drive returns 404 or `trashed=true`. Network / auth failures
/// land the doc id in `skipped_doc_ids` (no local deletion).
#[tauri::command]
pub async fn sweep_drive_deleted_docs(
    app: AppHandle,
    root: String,
    client_slug: String,
) -> Result<SweepResult, String> {
    let summaries = client_docs::list_client_docs(root.clone(), client_slug.clone())?;
    let candidates: Vec<(String, String)> = summaries
        .into_iter()
        .filter_map(|s| s.current_drive_file_id.map(|fid| (s.id, fid)))
        .collect();

    let mut result = SweepResult {
        removed_doc_ids: Vec::new(),
        skipped_doc_ids: Vec::new(),
        still_present_doc_ids: Vec::new(),
    };
    if candidates.is_empty() {
        return Ok(result);
    }

    let token = match google_access_token(&app).await {
        Ok(t) => t,
        Err(_) => {
            // No auth: skip everything, don't risk false deletes.
            result.skipped_doc_ids = candidates.into_iter().map(|(id, _)| id).collect();
            return Ok(result);
        }
    };

    let dir = client_docs::docs_dir(&root, &client_slug)?;
    let mut emitted_change = false;

    for (doc_id, file_id) in candidates {
        match classify_drive_file(&token, &file_id).await {
            DriveState::Present => result.still_present_doc_ids.push(doc_id),
            DriveState::Deleted => {
                match client_docs::find_doc_path(&dir, &doc_id) {
                    Ok(path) => {
                        if let Err(_) = fs::remove_file(&path) {
                            result.skipped_doc_ids.push(doc_id);
                            continue;
                        }
                        result.removed_doc_ids.push(doc_id);
                        emitted_change = true;
                    }
                    Err(_) => result.skipped_doc_ids.push(doc_id),
                }
            }
            DriveState::Unknown => result.skipped_doc_ids.push(doc_id),
        }
    }

    if emitted_change {
        emit_changed(&app, DataKind::Client, Some(client_slug), None);
    }
    Ok(result)
}

// =========================================================================
// Native binary upload (PNGs, etc.)
// =========================================================================
//
// Uploads a file as-is to Drive without triggering Google Doc conversion.
// Used for ad-creative PNGs and the campaign-tree snapshot — both stay as
// native PNG files in Drive, NOT wrapped in Docs.

/// Result of uploading a binary file. Mirrors `CreatedDoc` but mimeType is
/// whatever the caller asked for (image/png, image/jpeg, etc.).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadedFile {
    pub file_id: String,
    pub web_view_link: String,
    pub mime_type: String,
    pub name: String,
}

/// Sanitise a Drive filename. Replaces filesystem-illegal characters with
/// hyphens and caps length. Mirrors `drive_upload::sanitize_filename` so a
/// shared rule applies everywhere a name lands in Drive.
fn sanitize_drive_name(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "Untitled".to_string();
    }
    let cleaned: String = trimmed
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();
    if cleaned.len() > 180 {
        cleaned.chars().take(180).collect()
    } else {
        cleaned
    }
}

/// Reject mime types that don't look like a normal type/subtype pair. Keeps
/// the request body honest before we hand it to Drive.
fn is_valid_mime_type(mime: &str) -> bool {
    let trimmed = mime.trim();
    if trimmed.is_empty() || trimmed.len() > 120 {
        return false;
    }
    let mut parts = trimmed.splitn(2, '/');
    let type_part = parts.next().unwrap_or("");
    let subtype_part = parts.next().unwrap_or("");
    if type_part.is_empty() || subtype_part.is_empty() {
        return false;
    }
    let ok = |s: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '+' | '.' | '_'))
    };
    ok(type_part) && ok(subtype_part)
}

/// Core helper: multipart-upload a byte buffer to Drive as a native file
/// (NOT converted to Google Doc). Public to other Rust modules; the Tauri
/// commands below are the thin wrappers exposed to the frontend.
pub(crate) async fn create_drive_file_binary(
    app: &AppHandle,
    parent_folder_id: &str,
    filename: &str,
    mime_type: &str,
    bytes: &[u8],
) -> Result<UploadedFile, String> {
    if !is_valid_file_id(parent_folder_id) {
        return Err(format!(
            "invalid parent folder id: {parent_folder_id:?}"
        ));
    }
    if !is_valid_mime_type(mime_type) {
        return Err(format!(
            "invalid mime type: {mime_type:?} (expected something like image/png)"
        ));
    }
    if bytes.is_empty() {
        return Err("refusing to upload an empty file".to_string());
    }
    // Drive's hard cap is 5 TB but the frontend has no business pushing more
    // than a few MB here. 25 MB lets a PNG poster through with headroom.
    const MAX_BYTES: usize = 25 * 1024 * 1024;
    if bytes.len() > MAX_BYTES {
        return Err(format!(
            "file too large ({} bytes; max {})",
            bytes.len(),
            MAX_BYTES
        ));
    }

    let safe_name = sanitize_drive_name(filename);
    let token = google_access_token(app).await?;
    let bound = format!("hml_bin_{}", {
        let mut b = [0u8; 18];
        rand::thread_rng().fill_bytes(&mut b);
        b.iter().map(|x| format!("{x:02x}")).collect::<String>()
    });

    let metadata = json!({
        "name": safe_name,
        "parents": [parent_folder_id],
        // NB: we deliberately do NOT set mimeType to a Google-apps type here.
        // Drive will keep the original binary format.
        "mimeType": mime_type,
    })
    .to_string();

    // Multipart/related body — text metadata first, then raw bytes for the
    // binary part. Body assembled by hand to avoid pulling in a multipart
    // crate just for this.
    let mut body: Vec<u8> =
        Vec::with_capacity(bytes.len() + metadata.len() + 512);
    body.extend_from_slice(b"--");
    body.extend_from_slice(bound.as_bytes());
    body.extend_from_slice(b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata.as_bytes());
    body.extend_from_slice(b"\r\n--");
    body.extend_from_slice(bound.as_bytes());
    body.extend_from_slice(b"\r\nContent-Type: ");
    body.extend_from_slice(mime_type.as_bytes());
    body.extend_from_slice(b"\r\n\r\n");
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n--");
    body.extend_from_slice(bound.as_bytes());
    body.extend_from_slice(b"--\r\n");

    let client = reqwest::Client::new();
    let resp = client
        .post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=false&fields=id,name,mimeType,webViewLink",
        )
        .bearer_auth(&token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={bound}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("drive upload request: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 => "Google authentication expired or missing the Drive scope. Reconnect via Settings > Google Calendar.".to_string(),
            403 => format!(
                "Drive denied the upload (403). The target folder may be outside this app's drive.file scope. Body: {text}"
            ),
            404 => format!(
                "Drive folder not found (404). Check the folder ID for this client. Body: {text}"
            ),
            _ => format!("drive upload failed ({status}): {text}"),
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("drive upload returned non-JSON success: {e}. Body: {text}"))?;
    let file_id = parsed
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("drive upload response missing 'id'. Body: {text}"))?
        .to_string();
    let returned_mime = parsed
        .get("mimeType")
        .and_then(|v| v.as_str())
        .unwrap_or(mime_type)
        .to_string();
    let name = parsed
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&safe_name)
        .to_string();
    let web_view_link = parsed
        .get("webViewLink")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://drive.google.com/file/d/{file_id}/view"));

    Ok(UploadedFile {
        file_id,
        web_view_link,
        mime_type: returned_mime,
        name,
    })
}

/// Upload a file already saved on the local filesystem (e.g. an ad creative
/// PNG that AdCreativeStudio just saved). The frontend passes the absolute
/// path produced by `save_replicate_output`.
#[tauri::command]
pub async fn upload_local_file_to_drive(
    app: AppHandle,
    folder_id: String,
    source_path: String,
    filename: Option<String>,
    mime_type: String,
) -> Result<UploadedFile, String> {
    let path = Path::new(&source_path);
    if !path.is_absolute() {
        return Err(format!("source path must be absolute, got {source_path:?}"));
    }
    if !path.exists() {
        return Err(format!("source file does not exist: {source_path}"));
    }
    let bytes = fs::read(path).map_err(|e| format!("read source file: {e}"))?;

    let resolved_name = filename
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("upload.bin")
                .to_string()
        });

    create_drive_file_binary(&app, &folder_id, &resolved_name, &mime_type, &bytes).await
}

/// Upload a base64-encoded byte buffer to Drive. Used when the binary lives
/// in the frontend (e.g. the campaign tree rasterised from SVG to PNG via
/// canvas.toBlob → arrayBuffer → base64).
#[tauri::command]
pub async fn upload_bytes_to_drive(
    app: AppHandle,
    folder_id: String,
    filename: String,
    base64_bytes: String,
    mime_type: String,
) -> Result<UploadedFile, String> {
    let bytes = B64
        .decode(base64_bytes.as_bytes())
        .map_err(|e| format!("invalid base64 payload: {e}"))?;
    create_drive_file_binary(&app, &folder_id, &filename, &mime_type, &bytes).await
}
