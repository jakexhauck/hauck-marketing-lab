//! Replicate API client backing the Creative Studio playground.
//!
//! Exposes four Tauri commands:
//!   - `search_replicate_models`: search-driven model picker
//!   - `get_replicate_model`: fetch model details + OpenAPI input schema
//!   - `run_replicate_prediction`: create + wait for a prediction
//!   - `save_replicate_output`: download an output URL to disk
//!
//! Token lives in `AppConfig.replicate_api_token` (set via SettingsPage).

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

const API_BASE: &str = "https://api.replicate.com/v1";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplicateModel {
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_image_url: Option<String>,
    pub latest_version_id: Option<String>,
    pub run_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplicateModelDetail {
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_image_url: Option<String>,
    pub latest_version_id: Option<String>,
    /// Raw OpenAPI Input schema (properties + required + nested enum $refs).
    /// The frontend renders form fields off this directly.
    pub input_schema: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplicatePredictionResult {
    pub id: String,
    pub status: String,
    pub output: Value,
    pub error: Option<String>,
    pub logs: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReplicateSavedOutput {
    pub saved_path: String,
    pub filename: String,
    pub source_url: String,
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .expect("reqwest client")
}

fn parse_model(value: &Value) -> Option<ReplicateModel> {
    let owner = value.get("owner")?.as_str()?.to_string();
    let name = value.get("name")?.as_str()?.to_string();
    Some(ReplicateModel {
        owner,
        name,
        description: value
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        cover_image_url: value
            .get("cover_image_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        latest_version_id: value
            .pointer("/latest_version/id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        run_count: value.get("run_count").and_then(|v| v.as_u64()),
    })
}

/// Search models via Replicate's `QUERY /v1/models` endpoint (same one their
/// official Python SDK uses). Falls back to listing popular models when the
/// query is empty.
#[tauri::command]
pub async fn search_replicate_models(
    token: String,
    query: String,
) -> Result<Vec<ReplicateModel>, String> {
    if token.trim().is_empty() {
        return Err("Replicate API token is not set. Add it in Settings.".to_string());
    }

    let c = client();
    let resp = if query.trim().is_empty() {
        c.get(format!("{API_BASE}/models"))
            .bearer_auth(&token)
            .send()
            .await
    } else {
        c.request(
            reqwest::Method::from_bytes(b"QUERY").map_err(|e| format!("method: {e}"))?,
            format!("{API_BASE}/models"),
        )
        .bearer_auth(&token)
        .header("Content-Type", "text/plain")
        .body(query.trim().to_string())
        .send()
        .await
    };

    let resp = resp.map_err(|e| format!("replicate http: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("replicate search {status}: {text}"));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("replicate json: {e}"))?;

    let results = body
        .get("results")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "replicate search: no results array".to_string())?;

    let models: Vec<ReplicateModel> = results.iter().filter_map(parse_model).collect();
    Ok(models)
}

/// Fetch full model details (including OpenAPI input schema) for a specific
/// owner/name slug.
#[tauri::command]
pub async fn get_replicate_model(
    token: String,
    owner: String,
    name: String,
) -> Result<ReplicateModelDetail, String> {
    if token.trim().is_empty() {
        return Err("Replicate API token is not set. Add it in Settings.".to_string());
    }

    let c = client();
    let resp = c
        .get(format!("{API_BASE}/models/{owner}/{name}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("replicate http: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("replicate model {status}: {text}"));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("replicate json: {e}"))?;

    // Input schema sits at latest_version.openapi_schema.components.schemas.Input
    // along with any referenced enum schemas. We hand the whole `components.schemas`
    // block back so the frontend can resolve $refs.
    let input_schema = body
        .pointer("/latest_version/openapi_schema/components/schemas")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));

    Ok(ReplicateModelDetail {
        owner: body
            .get("owner")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: body
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        description: body
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        cover_image_url: body
            .get("cover_image_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        latest_version_id: body
            .pointer("/latest_version/id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        input_schema,
    })
}

/// Run a prediction on a specific model. Inputs is the JSON object Replicate's
/// schema expects (already with any file inputs converted to data URIs by the
/// caller). Uses `Prefer: wait=60` for a single-roundtrip synchronous response;
/// if the model is still running after 60s, polls until done.
#[tauri::command]
pub async fn run_replicate_prediction(
    token: String,
    owner: String,
    name: String,
    inputs: Value,
) -> Result<ReplicatePredictionResult, String> {
    if token.trim().is_empty() {
        return Err("Replicate API token is not set. Add it in Settings.".to_string());
    }

    let c = client();
    let resp = c
        .post(format!("{API_BASE}/models/{owner}/{name}/predictions"))
        .bearer_auth(&token)
        .header("Prefer", "wait=60")
        .json(&json!({ "input": inputs }))
        .send()
        .await
        .map_err(|e| format!("replicate http: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("replicate predict {status}: {text}"));
    }

    let mut body: Value = resp
        .json()
        .await
        .map_err(|e| format!("replicate json: {e}"))?;

    // Poll if not terminal yet.
    for _ in 0..120 {
        let status = body
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if status == "succeeded" || status == "failed" || status == "canceled" {
            break;
        }
        let get_url = body
            .pointer("/urls/get")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let Some(url) = get_url else { break };
        tokio::time::sleep(Duration::from_secs(2)).await;
        let next = c
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("replicate poll http: {e}"))?;
        if !next.status().is_success() {
            return Err(format!(
                "replicate poll {}: {}",
                next.status(),
                next.text().await.unwrap_or_default()
            ));
        }
        body = next
            .json()
            .await
            .map_err(|e| format!("replicate poll json: {e}"))?;
    }

    Ok(ReplicatePredictionResult {
        id: body
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        status: body
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        output: body.get("output").cloned().unwrap_or(Value::Null),
        error: body
            .get("error")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        logs: body
            .get("logs")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

fn ext_from_url(url: &str) -> &'static str {
    let lower = url.to_lowercase();
    if lower.contains(".webp") {
        "webp"
    } else if lower.contains(".jpg") || lower.contains(".jpeg") {
        "jpg"
    } else if lower.contains(".gif") {
        "gif"
    } else if lower.contains(".mp4") {
        "mp4"
    } else if lower.contains(".webm") {
        "webm"
    } else {
        "png"
    }
}

/// Download a Replicate output URL and save it to the given directory. The
/// file extension is inferred from the URL when possible. Returns the saved
/// absolute path.
#[tauri::command]
pub async fn save_replicate_output(
    url: String,
    output_dir: String,
    filename_stem: String,
) -> Result<ReplicateSavedOutput, String> {
    let dir = PathBuf::from(&output_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("create output dir: {e}"))?;

    let ext = ext_from_url(&url);
    let filename = format!("{filename_stem}.{ext}");
    let out_path = dir.join(&filename);

    let c = client();
    let resp = c
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download http: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download {}: {}", resp.status(), url));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("download bytes: {e}"))?;
    fs::write(&out_path, &bytes).map_err(|e| format!("write file: {e}"))?;

    Ok(ReplicateSavedOutput {
        saved_path: out_path.to_string_lossy().into_owned(),
        filename,
        source_url: url,
    })
}

/// Convert a local file path into a `data:` URI suitable for passing to a
/// Replicate model as a file input. Used by the frontend when the user uploads
/// a reference image. Caps at 25 MB to avoid blowing through request limits.
#[tauri::command]
pub async fn file_to_data_uri(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("stat: {e}"))?;
    if meta.len() > 25 * 1024 * 1024 {
        return Err(format!(
            "file too large ({} bytes); max 25 MB for inline upload",
            meta.len()
        ));
    }
    let bytes = fs::read(&p).map_err(|e| format!("read file: {e}"))?;
    let mime = mime_from_path(&p);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// Copy a local image/video into the client's creatives folder using the same
/// naming + return shape as `save_replicate_output`. Lets the user import ad
/// creatives they generated elsewhere (Gemini, Midjourney, phone screenshots)
/// into the wizard's save/Drive-push flow without round-tripping through
/// Replicate.
#[tauri::command]
pub async fn import_local_creative(
    source_path: String,
    output_dir: String,
    filename_stem: String,
) -> Result<ReplicateSavedOutput, String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(format!("source not found: {source_path}"));
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "png".to_string());

    let dir = PathBuf::from(&output_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("create output dir: {e}"))?;

    let filename = format!("{filename_stem}.{ext}");
    let out_path = dir.join(&filename);
    fs::copy(&src, &out_path).map_err(|e| format!("copy file: {e}"))?;

    Ok(ReplicateSavedOutput {
        saved_path: out_path.to_string_lossy().into_owned(),
        filename,
        source_url: source_path,
    })
}

fn mime_from_path(p: &PathBuf) -> &'static str {
    let lower = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    match lower.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}
