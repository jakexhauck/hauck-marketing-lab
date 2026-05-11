use crate::events::{emit_changed, DataKind};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Filename of the chosen benchmark YAML (e.g.
    /// `benchmarks-us-local-lead-gen.yaml`). `None` means the dashboard
    /// falls back to the hardcoded card metadata in `Kpis.tsx`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub benchmarks: Option<String>,
    /// URL to this client's Google Drive folder. Used as both a one-click
    /// human shortcut and the pointer agents use when loading client context.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drive_folder_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClientsFile {
    clients: Vec<ClientEntry>,
}

pub fn clients_path(root: &str) -> PathBuf {
    PathBuf::from(root).join("data").join("clients.yaml")
}

fn client_dir(root: &str, slug: &str) -> PathBuf {
    PathBuf::from(root).join("data").join(slug)
}

pub fn read_clients_file(root: &str) -> Result<Vec<ClientEntry>, String> {
    let path = clients_path(root);
    if !path.exists() {
        return Ok(vec![ClientEntry {
            slug: "willis-windows".to_string(),
            name: "Willis Windows".to_string(),
            status: ClientStatus::PreLaunch,
            created_at: None,
            benchmarks: None,
            drive_folder_url: None,
        }]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read clients: {e}"))?;
    let doc: ClientsFile =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse clients: {e}"))?;
    Ok(doc.clients)
}

pub fn write_clients_file(root: &str, clients: &[ClientEntry]) -> Result<(), String> {
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

fn slugify(name: &str) -> String {
    let lowered = name.trim().to_lowercase();
    // Replace any run of non-alphanumeric with a single dash
    let re = Regex::new(r"[^a-z0-9]+").expect("static regex");
    let with_dashes = re.replace_all(&lowered, "-");
    with_dashes.trim_matches('-').to_string()
}

fn ensure_unique_slug(base: &str, existing: &[ClientEntry]) -> String {
    let taken: Vec<&str> = existing.iter().map(|c| c.slug.as_str()).collect();
    if !taken.contains(&base) {
        return base.to_string();
    }
    let mut i: usize = 2;
    loop {
        let candidate = format!("{base}-{i}");
        if !taken.contains(&candidate.as_str()) {
            return candidate;
        }
        i += 1;
        if i > 999 {
            // pathological — fall back
            return format!("{base}-x");
        }
    }
}

fn validate_slug(slug: &str) -> Result<(), String> {
    let re = Regex::new(r"^[a-z0-9-]+$").expect("static regex");
    if !re.is_match(slug) {
        return Err(format!(
            "Invalid slug '{slug}'. Slugs must be lowercase letters, numbers, or dashes."
        ));
    }
    Ok(())
}

fn dir_is_empty(path: &PathBuf) -> Result<bool, String> {
    if !path.exists() {
        return Ok(true);
    }
    let mut entries = fs::read_dir(path).map_err(|e| format!("read dir: {e}"))?;
    Ok(entries.next().is_none())
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
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                benchmarks: None,
                drive_folder_url: None,
            });
        }
    }
    write_clients_file(&root, &clients)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(())
}

#[tauri::command]
pub fn add_client(
    app: AppHandle,
    root: String,
    slug: String,
    name: String,
    drive_folder_url: Option<String>,
) -> Result<ClientEntry, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Client name cannot be empty.".to_string());
    }

    let requested = slug.trim().to_string();
    let base = if requested.is_empty() {
        slugify(&trimmed_name)
    } else {
        slugify(&requested)
    };
    if base.is_empty() {
        return Err("Could not derive a slug from that name.".to_string());
    }
    validate_slug(&base)?;

    let mut clients = read_clients_file(&root)?;

    // If the explicit slug was provided AND collides, treat as error per spec.
    // If only the name was provided (slug empty), auto-suffix.
    let final_slug = if requested.is_empty() {
        ensure_unique_slug(&base, &clients)
    } else {
        if clients.iter().any(|c| c.slug == base) {
            return Err(format!("A client with slug '{base}' already exists."));
        }
        base
    };

    let normalized_drive = drive_folder_url.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });

    let entry = ClientEntry {
        slug: final_slug.clone(),
        name: trimmed_name,
        status: ClientStatus::PreLaunch,
        created_at: Some(chrono::Utc::now().to_rfc3339()),
        benchmarks: None,
        drive_folder_url: normalized_drive,
    };

    clients.push(entry.clone());
    write_clients_file(&root, &clients)?;

    // create data/<slug>/ directory
    let dir = client_dir(&root, &final_slug);
    fs::create_dir_all(&dir).map_err(|e| format!("create client dir: {e}"))?;

    emit_changed(&app, DataKind::Client, Some(final_slug), None);
    Ok(entry)
}

#[tauri::command]
pub fn rename_client(
    app: AppHandle,
    root: String,
    slug: String,
    new_name: String,
) -> Result<(), String> {
    let trimmed = new_name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Client name cannot be empty.".to_string());
    }
    let mut clients = read_clients_file(&root)?;
    match clients.iter_mut().find(|c| c.slug == slug) {
        Some(entry) => entry.name = trimmed,
        None => return Err(format!("No client with slug '{slug}'.")),
    }
    write_clients_file(&root, &clients)?;
    emit_changed(&app, DataKind::Client, Some(slug), None);
    Ok(())
}

/// Set (or clear) the benchmark file reference for a client.
/// Pass `None` (i.e. omit / pass null from TS) to clear.
#[tauri::command]
pub fn set_client_benchmarks(
    app: AppHandle,
    root: String,
    client_slug: String,
    filename: Option<String>,
) -> Result<(), String> {
    let mut clients = read_clients_file(&root)?;
    let normalized = filename.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    match clients.iter_mut().find(|c| c.slug == client_slug) {
        Some(existing) => existing.benchmarks = normalized,
        None => return Err(format!("No client with slug '{client_slug}'.")),
    }
    write_clients_file(&root, &clients)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(())
}

/// Set (or clear) the Google Drive folder URL for a client.
#[tauri::command]
pub fn set_client_drive_folder(
    app: AppHandle,
    root: String,
    client_slug: String,
    url: Option<String>,
) -> Result<(), String> {
    let mut clients = read_clients_file(&root)?;
    let normalized = url.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    match clients.iter_mut().find(|c| c.slug == client_slug) {
        Some(existing) => existing.drive_folder_url = normalized,
        None => return Err(format!("No client with slug '{client_slug}'.")),
    }
    write_clients_file(&root, &clients)?;
    emit_changed(&app, DataKind::Client, Some(client_slug), None);
    Ok(())
}

#[tauri::command]
pub fn delete_client(app: AppHandle, root: String, slug: String) -> Result<(), String> {
    let clients = read_clients_file(&root)?;
    if !clients.iter().any(|c| c.slug == slug) {
        return Err(format!("No client with slug '{slug}'."));
    }

    let dir = client_dir(&root, &slug);
    if !dir_is_empty(&dir)? {
        return Err(format!(
            "Client folder data/{slug}/ is not empty. Remove its files first if you want to delete this client."
        ));
    }

    let remaining: Vec<ClientEntry> = clients.into_iter().filter(|c| c.slug != slug).collect();
    write_clients_file(&root, &remaining)?;

    // best-effort remove the (empty) directory
    if dir.exists() {
        let _ = fs::remove_dir(&dir);
    }

    emit_changed(&app, DataKind::Client, Some(slug), None);
    Ok(())
}
