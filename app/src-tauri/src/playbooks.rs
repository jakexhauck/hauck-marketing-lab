use crate::events::{emit_changed, DataKind};
use crate::vault::vault_root;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const REQUIRED_FILES: [&str; 6] = [
    "audience.md",
    "offers.md",
    "angles.md",
    "creative-brief.md",
    "competitors.md",
    "benchmarks.json",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaybookBenchmarks {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpl_target: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpm_min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpm_max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctr_floor: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roas_target: Option<f64>,
}

impl Default for PlaybookBenchmarks {
    fn default() -> Self {
        PlaybookBenchmarks {
            cpl_target: None,
            cpm_min: None,
            cpm_max: None,
            ctr_floor: None,
            roas_target: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaybookSummary {
    pub slug: String,
    pub display_name: String,
    pub complete: bool,
    pub missing: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaybookContent {
    pub slug: String,
    pub display_name: String,
    pub audience: String,
    pub offers: String,
    pub angles: String,
    pub creative_brief: String,
    pub competitors: String,
    pub benchmarks: PlaybookBenchmarks,
    pub missing: Vec<String>,
}

fn playbooks_root(root: &str) -> PathBuf {
    vault_root(root).join("Playbooks")
}

fn slug_to_display(slug: &str) -> String {
    slug.split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().chain(chars).collect(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn validate_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() {
        return Err("Slug cannot be empty.".to_string());
    }
    let ok = slug
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !ok {
        return Err(format!(
            "Invalid slug '{slug}'. Use lowercase letters, digits, or dashes only."
        ));
    }
    if slug.starts_with('-') || slug.ends_with('-') {
        return Err("Slug cannot start or end with a dash.".to_string());
    }
    Ok(())
}

fn read_text(path: &PathBuf) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

fn read_benchmarks(path: &PathBuf) -> PlaybookBenchmarks {
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return PlaybookBenchmarks::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn missing_files(dir: &PathBuf) -> Vec<String> {
    REQUIRED_FILES
        .iter()
        .filter(|f| !dir.join(f).exists())
        .map(|f| (*f).to_string())
        .collect()
}

#[tauri::command]
pub fn list_playbooks(root: String) -> Result<Vec<PlaybookSummary>, String> {
    let dir = playbooks_root(&root);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("read Playbooks: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let slug = match p.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        if slug.starts_with('.') {
            continue;
        }
        let missing = missing_files(&p);
        out.push(PlaybookSummary {
            display_name: slug_to_display(&slug),
            complete: missing.is_empty(),
            missing,
            slug,
        });
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

#[tauri::command]
pub fn read_playbook(root: String, slug: String) -> Result<PlaybookContent, String> {
    validate_slug(&slug)?;
    let dir = playbooks_root(&root).join(&slug);
    if !dir.exists() {
        return Err(format!("Playbook '{slug}' not found."));
    }
    let missing = missing_files(&dir);
    Ok(PlaybookContent {
        display_name: slug_to_display(&slug),
        audience: read_text(&dir.join("audience.md")),
        offers: read_text(&dir.join("offers.md")),
        angles: read_text(&dir.join("angles.md")),
        creative_brief: read_text(&dir.join("creative-brief.md")),
        competitors: read_text(&dir.join("competitors.md")),
        benchmarks: read_benchmarks(&dir.join("benchmarks.json")),
        missing,
        slug,
    })
}

#[tauri::command]
pub fn read_playbook_field(
    root: String,
    slug: String,
    field: String,
) -> Result<Option<String>, String> {
    validate_slug(&slug)?;
    let filename = match field.as_str() {
        "audience" => "audience.md",
        "offers" => "offers.md",
        "angles" => "angles.md",
        "creative-brief" | "creative_brief" => "creative-brief.md",
        "competitors" => "competitors.md",
        "benchmarks" => "benchmarks.json",
        other => return Err(format!("Unknown playbook field '{other}'.")),
    };
    let path = playbooks_root(&root).join(&slug).join(filename);
    if !path.exists() {
        return Ok(None);
    }
    let body = read_text(&path);
    if body.trim().is_empty() {
        Ok(None)
    } else {
        Ok(Some(body))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaybookSaveInput {
    pub slug: String,
    #[serde(default)]
    pub display_name: Option<String>,
    pub audience: String,
    pub offers: String,
    pub angles: String,
    pub creative_brief: String,
    pub competitors: String,
    pub benchmarks: PlaybookBenchmarks,
}

#[tauri::command]
pub fn save_playbook(
    app: AppHandle,
    root: String,
    input: PlaybookSaveInput,
) -> Result<PlaybookContent, String> {
    validate_slug(&input.slug)?;
    let dir = playbooks_root(&root).join(&input.slug);
    fs::create_dir_all(&dir).map_err(|e| format!("create playbook dir: {e}"))?;

    fs::write(dir.join("audience.md"), input.audience.as_bytes())
        .map_err(|e| format!("write audience.md: {e}"))?;
    fs::write(dir.join("offers.md"), input.offers.as_bytes())
        .map_err(|e| format!("write offers.md: {e}"))?;
    fs::write(dir.join("angles.md"), input.angles.as_bytes())
        .map_err(|e| format!("write angles.md: {e}"))?;
    fs::write(dir.join("creative-brief.md"), input.creative_brief.as_bytes())
        .map_err(|e| format!("write creative-brief.md: {e}"))?;
    fs::write(dir.join("competitors.md"), input.competitors.as_bytes())
        .map_err(|e| format!("write competitors.md: {e}"))?;
    let bench_json = serde_json::to_string_pretty(&input.benchmarks)
        .map_err(|e| format!("serialize benchmarks: {e}"))?;
    fs::write(dir.join("benchmarks.json"), bench_json.as_bytes())
        .map_err(|e| format!("write benchmarks.json: {e}"))?;

    emit_changed(&app, DataKind::Vault, None, Some(dir.to_string_lossy().into_owned()));
    read_playbook(root, input.slug)
}

#[tauri::command]
pub fn delete_playbook(app: AppHandle, root: String, slug: String) -> Result<(), String> {
    validate_slug(&slug)?;
    let dir = playbooks_root(&root).join(&slug);
    if !dir.exists() {
        return Err(format!("Playbook '{slug}' not found."));
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("delete playbook: {e}"))?;
    emit_changed(&app, DataKind::Vault, None, Some(dir.to_string_lossy().into_owned()));
    Ok(())
}

/// Validate every playbook on disk; returns a list of warnings for incomplete
/// directories. Wired into app startup via the frontend (no panic on missing
/// files, just a console warning).
#[tauri::command]
pub fn validate_playbooks(root: String) -> Result<Vec<String>, String> {
    let summaries = list_playbooks(root)?;
    let mut warnings = Vec::new();
    for s in summaries {
        if !s.complete {
            warnings.push(format!(
                "Playbook '{}' is missing: {}",
                s.slug,
                s.missing.join(", ")
            ));
        }
    }
    Ok(warnings)
}
