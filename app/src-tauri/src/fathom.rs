use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FathomFetchResult {
    pub url: String,
    pub text: String,
    pub byte_len: usize,
    pub source_hint: String,
}

fn is_fathom_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.starts_with("https://fathom.video/")
        || lower.starts_with("http://fathom.video/")
        || lower.starts_with("https://app.fathom.video/")
}

/// Aggressive HTML → plain text. Drops <script>, <style>, <noscript> blocks
/// entirely. Replaces remaining tags with whitespace. Decodes a handful of
/// common HTML entities. Collapses runs of whitespace.
fn html_to_text(html: &str) -> String {
    // Rust's regex crate has no backreferences, so each block tag is spelled out.
    let drop_blocks = Regex::new(
        r"(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>",
    )
    .unwrap();
    let no_blocks = drop_blocks.replace_all(html, " ");
    let tag = Regex::new(r"(?s)<[^>]+>").unwrap();
    let no_tags = tag.replace_all(&no_blocks, " ");

    let mut decoded = no_tags
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");

    // Numeric entities like &#8217; — collapse to a space-ish placeholder.
    let num_ent = Regex::new(r"&#\d+;").unwrap();
    decoded = num_ent.replace_all(&decoded, " ").to_string();
    let hex_ent = Regex::new(r"&#x[0-9a-fA-F]+;").unwrap();
    decoded = hex_ent.replace_all(&decoded, " ").to_string();

    // Collapse whitespace, keep paragraph breaks.
    let many_newlines = Regex::new(r"\n{3,}").unwrap();
    let mut squashed = decoded.replace('\r', "\n");
    let lines: Vec<String> = squashed
        .split('\n')
        .map(|line| {
            Regex::new(r"\s+")
                .unwrap()
                .replace_all(line, " ")
                .trim()
                .to_string()
        })
        .filter(|line| !line.is_empty())
        .collect();
    squashed = lines.join("\n");
    squashed = many_newlines.replace_all(&squashed, "\n\n").to_string();
    squashed
}

/// Best-effort: pull the largest contiguous block of human-readable text from
/// the page. Fathom share pages embed the transcript in HTML once rendered;
/// for static SSR'd portions this returns the visible call summary + any
/// transcript paragraphs. If nothing useful is found, returns the full
/// cleaned text and lets the extractor sort it out.
fn isolate_likely_transcript(text: &str) -> (String, &'static str) {
    // Heuristic 1: look for a long run of paragraph-shaped lines.
    let lines: Vec<&str> = text.split('\n').collect();
    let mut best_start = 0usize;
    let mut best_len = 0usize;
    let mut cur_start = 0usize;
    let mut cur_len = 0usize;
    for (i, line) in lines.iter().enumerate() {
        let words = line.split_whitespace().count();
        if words >= 6 {
            if cur_len == 0 {
                cur_start = i;
            }
            cur_len += 1;
        } else {
            if cur_len > best_len {
                best_len = cur_len;
                best_start = cur_start;
            }
            cur_len = 0;
        }
    }
    if cur_len > best_len {
        best_len = cur_len;
        best_start = cur_start;
    }
    if best_len >= 8 {
        let block: String = lines[best_start..best_start + best_len].join("\n");
        return (block, "paragraph-block heuristic");
    }
    (text.to_string(), "full page text")
}

#[tauri::command]
pub async fn fetch_fathom_transcript(url: String) -> Result<FathomFetchResult, String> {
    let url = url.trim().to_string();
    if !is_fathom_url(&url) {
        return Err(
            "URL doesn't look like a Fathom share link (expected fathom.video host).".into(),
        );
    }

    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("build http client: {e}"))?;

    let resp = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!(
            "Fathom returned HTTP {}. The link may require login or be expired.",
            status.as_u16()
        ));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    let cleaned = html_to_text(&html);
    if cleaned.trim().len() < 200 {
        return Err(
            "Fathom page loaded but no readable content was found. The transcript may be \
             behind login. Export the .txt from Fathom and drop it instead."
                .into(),
        );
    }

    let (block, hint) = isolate_likely_transcript(&cleaned);
    let byte_len = block.as_bytes().len();
    Ok(FathomFetchResult {
        url,
        text: block,
        byte_len,
        source_hint: hint.to_string(),
    })
}
