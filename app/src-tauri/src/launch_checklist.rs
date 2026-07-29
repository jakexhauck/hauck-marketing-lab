use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ChecklistStatus {
    Go,
    Hold,
    Stop,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChecklistItem {
    pub id: String,
    pub label: String,
    pub status: ChecklistStatus,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LaunchChecklist {
    pub client: String,
    pub updated_at: String,
    pub items: Vec<ChecklistItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum ClientStatus {
    PreLaunch,
    Live,
    Paused,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClientEntry {
    pub slug: String,
    pub name: String,
    pub status: ClientStatus,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClientsFile {
    clients: Vec<ClientEntry>,
}

fn default_items() -> Vec<ChecklistItem> {
    let defs: &[(&str, &str)] = &[
        ("meta_token", "Meta access token entered"),
        ("pixel_installed", "Pixel installed + verified"),
        ("capi_configured", "CAPI configured"),
        ("domain_verified", "Domain verified"),
        ("lead_form", "Lead form built"),
        ("creative_pool", "Creative pool seeded (8+ angles, 12+ hooks)"),
        ("audiences", "Audiences defined"),
        ("budget", "Budget agreed"),
        ("tracking_dry_run", "Tracking dry-run passed"),
    ];
    defs.iter()
        .map(|(id, label)| ChecklistItem {
            id: (*id).to_string(),
            label: (*label).to_string(),
            status: ChecklistStatus::Stop,
            note: None,
        })
        .collect()
}

fn checklist_path(root: &str, slug: &str) -> PathBuf {
    PathBuf::from(root)
        .join("data")
        .join(slug)
        .join("launch-checklist.yaml")
}

fn clients_path(root: &str) -> PathBuf {
    PathBuf::from(root).join("data").join("clients.yaml")
}

fn read_clients_file(root: &str) -> Result<Vec<ClientEntry>, String> {
    let path = clients_path(root);
    if !path.exists() {
        return Ok(vec![ClientEntry {
            slug: "willis-windows".to_string(),
            name: "Willis Windows".to_string(),
            status: ClientStatus::PreLaunch,
        }]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read clients: {e}"))?;
    let doc: ClientsFile =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse clients: {e}"))?;
    Ok(doc.clients)
}

fn write_clients_file(root: &str, clients: &[ClientEntry]) -> Result<(), String> {
    let path = clients_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let doc = ClientsFile {
        clients: clients.to_vec(),
    };
    let yaml = serde_yaml::to_string(&doc).map_err(|e| format!("serialize clients: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write clients: {e}"))
}

#[tauri::command]
pub fn read_launch_checklist(
    root: String,
    client_slug: String,
) -> Result<LaunchChecklist, String> {
    let path = checklist_path(&root, &client_slug);
    if !path.exists() {
        return Ok(LaunchChecklist {
            client: client_slug,
            updated_at: Utc::now().to_rfc3339(),
            items: default_items(),
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read checklist: {e}"))?;
    serde_yaml::from_str(&raw).map_err(|e| format!("parse checklist: {e}"))
}

#[tauri::command]
pub fn write_launch_checklist(
    app: AppHandle,
    root: String,
    client_slug: String,
    checklist: LaunchChecklist,
) -> Result<(), String> {
    let path = checklist_path(&root, &client_slug);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let stamped = LaunchChecklist {
        client: checklist.client,
        updated_at: Utc::now().to_rfc3339(),
        items: checklist.items,
    };
    let yaml = serde_yaml::to_string(&stamped).map_err(|e| format!("serialize checklist: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write checklist: {e}"))?;
    emit_changed(
        &app,
        DataKind::LaunchChecklist,
        Some(client_slug),
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}

#[tauri::command]
pub fn list_clients(root: String) -> Result<Vec<ClientEntry>, String> {
    read_clients_file(&root)
}

#[tauri::command]
pub fn read_client_status(root: String, client_slug: String) -> Result<ClientStatus, String> {
    let clients = read_clients_file(&root)?;
    Ok(clients
        .into_iter()
        .find(|c| c.slug == client_slug)
        .map(|c| c.status)
        .unwrap_or(ClientStatus::PreLaunch))
}

#[tauri::command]
pub fn set_client_status(
    app: AppHandle,
    root: String,
    client_slug: String,
    status: ClientStatus,
) -> Result<(), String> {
    let mut clients = read_clients_file(&root)?;
    match clients.iter_mut().find(|c| c.slug == client_slug) {
        Some(existing) => existing.status = status,
        None => {
            let name = client_slug
                .split('-')
                .map(|part| {
                    let mut chars = part.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(c) => c.to_uppercase().chain(chars).collect(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            clients.push(ClientEntry {
                slug: client_slug.clone(),
                name,
                status,
            });
        }
    }
    write_clients_file(&root, &clients)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(())
}

#[tauri::command]
pub fn save_launch_readiness_verdict(
    app: AppHandle,
    root: String,
    client_slug: String,
    body: String,
) -> Result<String, String> {
    let date = Utc::now().format("%Y-%m-%d").to_string();
    let dir = PathBuf::from(&root).join("outputs").join("launch-readiness");
    fs::create_dir_all(&dir).map_err(|e| format!("create dirs: {e}"))?;
    let path = dir.join(format!("{date}-{client_slug}.md"));
    fs::write(&path, body).map_err(|e| format!("write verdict: {e}"))?;
    let path_str = path.to_string_lossy().into_owned();
    emit_changed(
        &app,
        DataKind::LaunchChecklist,
        Some(client_slug),
        Some(path_str.clone()),
    );
    Ok(path_str)
}
