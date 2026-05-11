use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KpiEntry {
    pub client: String,
    pub date: String,
    pub window: String,
    #[serde(default)]
    pub spend: Option<f64>,
    #[serde(default)]
    pub cpm: Option<f64>,
    #[serde(default)]
    pub ctr: Option<f64>,
    #[serde(default)]
    pub cvr: Option<f64>,
    #[serde(default)]
    pub cpa: Option<f64>,
    #[serde(default)]
    pub roas: Option<f64>,
    pub updated_at: String,
}

fn kpi_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("data").join("kpis")
}

fn kpi_path(root: &str, client_slug: &str, date: &str) -> PathBuf {
    kpi_dir(root).join(format!("{client_slug}-{date}.yaml"))
}

fn list_client_entries(root: &str, client_slug: &str) -> Result<Vec<(String, PathBuf)>, String> {
    let dir = kpi_dir(root);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let prefix = format!("{client_slug}-");
    let mut entries: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read kpi dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read kpi entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !file_name.starts_with(&prefix) || !file_name.ends_with(".yaml") {
            continue;
        }
        let date_part = file_name
            .trim_start_matches(&prefix)
            .trim_end_matches(".yaml")
            .to_string();
        entries.push((date_part, path));
    }
    // newest first by date string (YYYY-MM-DD sorts lexicographically)
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(entries)
}

fn read_entry_file(path: &PathBuf) -> Result<KpiEntry, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read kpi: {e}"))?;
    serde_yaml::from_str(&raw).map_err(|e| format!("parse kpi: {e}"))
}

#[tauri::command]
pub fn read_latest_kpis(
    root: String,
    client_slug: String,
) -> Result<Option<KpiEntry>, String> {
    let entries = list_client_entries(&root, &client_slug)?;
    match entries.first() {
        Some((_, path)) => Ok(Some(read_entry_file(path)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn read_kpi_history(
    root: String,
    client_slug: String,
    limit: usize,
) -> Result<Vec<KpiEntry>, String> {
    let entries = list_client_entries(&root, &client_slug)?;
    let mut out: Vec<KpiEntry> = Vec::with_capacity(entries.len().min(limit));
    for (_, path) in entries.into_iter().take(limit) {
        out.push(read_entry_file(&path)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn write_kpi_entry(
    root: String,
    client_slug: String,
    entry: KpiEntry,
) -> Result<String, String> {
    let path = kpi_path(&root, &client_slug, &entry.date);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let stamped = KpiEntry {
        client: entry.client,
        date: entry.date,
        window: entry.window,
        spend: entry.spend,
        cpm: entry.cpm,
        ctr: entry.ctr,
        cvr: entry.cvr,
        cpa: entry.cpa,
        roas: entry.roas,
        updated_at: Utc::now().to_rfc3339(),
    };
    let yaml = serde_yaml::to_string(&stamped).map_err(|e| format!("serialize kpi: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write kpi: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}
