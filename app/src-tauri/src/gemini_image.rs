//! Nano Banana 2 (Gemini 3 Pro Image) image generation.
//!
//! Wraps the Google AI Studio REST endpoint and saves the returned PNG
//! bytes to disk. Used by the AD_CREATIVE form to turn each chosen ad copy
//! variation into a ready-to-upload static creative.
//!
//! API key lives in AppConfig.gemini_api_key (set via SettingsPage).

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const MODEL_ID: &str = "gemini-3-pro-image-preview";
const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativePrompt {
    /// Output PNG filename (no path), e.g. "ad-3-1x1.png".
    pub filename: String,
    /// One of "1:1", "9:16", "4:5", "16:9". Passed to Gemini's imageConfig.
    pub aspect_ratio: String,
    /// The full Nano Banana 2 prompt body.
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativeImageResult {
    pub filename: String,
    pub saved_path: String,
    pub aspect_ratio: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativeBatchError {
    pub filename: String,
    pub error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreativeBatchResult {
    pub saved: Vec<CreativeImageResult>,
    pub errors: Vec<CreativeBatchError>,
}

async fn call_gemini_image(
    api_key: &str,
    prompt: &str,
    aspect_ratio: &str,
) -> Result<Vec<u8>, String> {
    let url = format!("{API_BASE}/{MODEL_ID}:generateContent?key={api_key}");
    let body = json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": { "aspectRatio": aspect_ratio }
        }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("gemini http: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("gemini {status}: {text}"));
    }

    let value: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("gemini json: {e}"))?;

    let inline_data = value
        .pointer("/candidates/0/content/parts/0/inlineData/data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            format!(
                "gemini response missing inlineData.data. Raw: {}",
                serde_json::to_string(&value).unwrap_or_default()
            )
        })?;

    base64::engine::general_purpose::STANDARD
        .decode(inline_data)
        .map_err(|e| format!("base64 decode: {e}"))
}

/// Generate a single image. Useful for one-off testing from the UI.
#[tauri::command]
pub async fn generate_nano_banana_image(
    api_key: String,
    prompt: String,
    aspect_ratio: String,
    output_path: String,
) -> Result<String, String> {
    let bytes = call_gemini_image(&api_key, &prompt, &aspect_ratio).await?;
    let path = PathBuf::from(&output_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("write png: {e}"))?;
    Ok(output_path)
}

/// Generate a whole creative set, one image per CreativePrompt. Errors on
/// individual prompts are captured in `errors` so a single API failure
/// doesn't abort the whole batch.
#[tauri::command]
pub async fn generate_creative_set(
    api_key: String,
    prompts: Vec<CreativePrompt>,
    output_dir: String,
) -> Result<CreativeBatchResult, String> {
    let dir = PathBuf::from(&output_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("create output dir: {e}"))?;

    let mut saved = Vec::new();
    let mut errors = Vec::new();

    for p in prompts {
        let out_path = dir.join(&p.filename);
        match call_gemini_image(&api_key, &p.prompt, &p.aspect_ratio).await {
            Ok(bytes) => {
                if let Err(e) = fs::write(&out_path, &bytes) {
                    errors.push(CreativeBatchError {
                        filename: p.filename.clone(),
                        error: format!("write png: {e}"),
                    });
                    continue;
                }
                saved.push(CreativeImageResult {
                    filename: p.filename.clone(),
                    saved_path: out_path.to_string_lossy().into_owned(),
                    aspect_ratio: p.aspect_ratio.clone(),
                });
            }
            Err(e) => {
                errors.push(CreativeBatchError {
                    filename: p.filename.clone(),
                    error: e,
                });
            }
        }
    }

    Ok(CreativeBatchResult { saved, errors })
}
