//! Read a local file's text so a chat can inline it into the prompt.
//!
//! Backs the SkillChat attach button (copywriter, data analyst, and any future
//! skill chat). Text formats (CSV / TSV / TXT / MD / JSON) inline perfectly and
//! are what we steer users toward (a Google Sheet should be exported as CSV).
//! Digital PDFs are supported via text extraction; scanned/image PDFs have no
//! extractable text and are rejected with guidance. Other binaries (xlsx,
//! images) are rejected rather than dumping garbage into the prompt.

use std::path::PathBuf;

/// Default cap on inlined text. Big enough for a heavy batch of reviews, small
/// enough to keep the prompt sane. Frontend can override.
const DEFAULT_MAX_BYTES: u64 = 300_000;

#[derive(serde::Serialize)]
pub struct AttachmentText {
    /// File name only (no path), for display.
    pub name: String,
    /// The file's text content, possibly truncated to `max_bytes`.
    pub text: String,
    /// Total size on disk, in bytes (pre-truncation).
    pub bytes: u64,
    /// True when the content was cut to fit `max_bytes`.
    pub truncated: bool,
}

#[tauri::command]
pub fn read_attachment_text(
    path: String,
    max_bytes: Option<u64>,
) -> Result<AttachmentText, String> {
    let p = PathBuf::from(&path);
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Size on disk, reported pre-truncation. Best-effort.
    let disk_bytes = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
    let cap = max_bytes.unwrap_or(DEFAULT_MAX_BYTES) as usize;

    // Resolve the raw text by type before applying the shared size cap.
    let raw_text: String = if ext == "pdf" {
        let extracted = pdf_extract::extract_text(&p)
            .map_err(|e| format!("Could not read {} as a PDF: {}", name, e))?;
        if extracted.trim().is_empty() {
            return Err(format!(
                "{} has no extractable text (likely a scanned or image-only PDF). Export it as CSV or paste the text instead.",
                name
            ));
        }
        extracted
    } else {
        let data = std::fs::read(&p).map_err(|e| format!("Could not read {}: {}", name, e))?;
        // Binary check on a prefix: if a lossy decode is mostly replacement
        // chars, it's not text we can usefully inline.
        let probe_len = data.len().min(cap);
        let probe = String::from_utf8_lossy(&data[..probe_len]);
        let total_chars = probe.chars().count().max(1);
        let replacements = probe.chars().filter(|&c| c == '\u{FFFD}').count();
        if replacements * 20 > total_chars {
            return Err(format!(
                "{} looks like a binary file (xlsx, image, etc.). Export it as CSV or paste the text instead.",
                name
            ));
        }
        String::from_utf8_lossy(&data).into_owned()
    };

    // Shared, char-safe truncation to keep the prompt sane.
    let truncated = raw_text.len() > cap;
    let text = if truncated {
        let mut end = cap;
        while end > 0 && !raw_text.is_char_boundary(end) {
            end -= 1;
        }
        raw_text[..end].to_string()
    } else {
        raw_text
    };

    Ok(AttachmentText {
        name,
        text,
        bytes: disk_bytes,
        truncated,
    })
}
