use crate::events::{emit_changed, DataKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn vault_root(root: &str) -> PathBuf {
    let p = PathBuf::from(root);
    // Prefer the sibling layout: project-root/vault next to project-root/media-buying.
    // This is the canonical Obsidian layout (vault opens cleanly at the project root).
    if let Some(parent) = p.parent() {
        let sibling = parent.join("vault");
        if sibling.exists() {
            return sibling;
        }
    }
    // Fallback: nested vault inside the picked root.
    p.join("vault")
}

#[tauri::command]
pub fn vault_root_path(root: String) -> String {
    vault_root(&root).to_string_lossy().to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct NoteFront {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(flatten, default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub extra: std::collections::BTreeMap<String, serde_yaml::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultNote {
    pub path: String,
    pub rel_path: String,
    pub front: NoteFront,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct KnowledgeQuery {
    #[serde(default)]
    pub client: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

fn parse_note(path: &Path, root: &Path) -> Result<VaultNote, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("read note '{}': {e}", path.display()))?;
    let (front, body) = match crate::frontmatter::split(&raw) {
        Some((yaml, body)) => {
            let parsed: NoteFront = serde_yaml::from_str(&yaml).unwrap_or_default();
            (parsed, body)
        }
        None => (NoteFront::default(), raw),
    };
    let rel = path
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().into_owned());
    Ok(VaultNote {
        path: path.to_string_lossy().into_owned(),
        rel_path: rel,
        front,
        body,
    })
}

fn render_note(front: &NoteFront, body: &str) -> Result<String, String> {
    let yaml = serde_yaml::to_string(front).map_err(|e| format!("serialize front: {e}"))?;
    let trimmed = yaml.trim_start_matches("---\n");
    let body_clean = body.trim_start_matches('\n');
    Ok(format!("---\n{trimmed}---\n\n{body_clean}"))
}

#[tauri::command]
pub fn read_vault_note(root: String, path: String) -> Result<VaultNote, String> {
    let vault = vault_root(&root);
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Note not found: {path}"));
    }
    parse_note(&p, &vault)
}

#[tauri::command]
pub fn write_vault_note(
    app: AppHandle,
    root: String,
    path: String,
    front: NoteFront,
    body: String,
) -> Result<VaultNote, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
    }
    let rendered = render_note(&front, &body)?;
    fs::write(&p, rendered).map_err(|e| format!("write note: {e}"))?;

    let vault = vault_root(&root);
    let note = parse_note(&p, &vault)?;
    let client_slug = note.front.client.clone();
    emit_changed(&app, DataKind::Vault, client_slug, Some(note.path.clone()));
    Ok(note)
}

#[tauri::command]
pub fn append_to_memory(
    app: AppHandle,
    root: String,
    client_slug: String,
    fact: String,
) -> Result<VaultNote, String> {
    let trimmed = fact.trim();
    if trimmed.is_empty() {
        return Err("Fact cannot be empty.".to_string());
    }

    let clients = crate::clients::read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;

    let memory_path = vault_root(&root)
        .join("Clients")
        .join(&client.name)
        .join("Memory.md");

    if !memory_path.exists() {
        if let Some(parent) = memory_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create dirs: {e}"))?;
        }
        let starter = format!(
            "---\ntype: memory\nclient: {slug}\nagent: all\ntags: [client, memory]\n---\n\n# {name} — Memory\n\nAppend-only running list of facts.\n\nFormat: `- YYYY-MM-DD — fact`\n\n## Facts\n\n<!-- Add new facts above this line. -->\n",
            slug = client_slug,
            name = client.name,
        );
        fs::write(&memory_path, starter).map_err(|e| format!("seed memory: {e}"))?;
    }

    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let bullet = format!("- {date} — {trimmed}\n");

    let mut existing =
        fs::read_to_string(&memory_path).map_err(|e| format!("read memory: {e}"))?;

    let marker = "<!-- Add new facts above this line.";
    if let Some(idx) = existing.find(marker) {
        existing.insert_str(idx, &bullet);
    } else if let Some(idx) = existing.find("## Facts") {
        let after_heading = idx + "## Facts".len();
        let nl = existing[after_heading..]
            .find('\n')
            .map(|n| after_heading + n + 1)
            .unwrap_or(existing.len());
        existing.insert_str(nl, &format!("\n{bullet}"));
    } else {
        if !existing.ends_with('\n') {
            existing.push('\n');
        }
        existing.push_str(&bullet);
    }

    fs::write(&memory_path, &existing).map_err(|e| format!("write memory: {e}"))?;

    let vault = vault_root(&root);
    let note = parse_note(&memory_path, &vault)?;
    emit_changed(
        &app,
        DataKind::Vault,
        Some(client_slug),
        Some(note.path.clone()),
    );
    Ok(note)
}

#[tauri::command]
pub fn read_about_notes(root: String) -> Result<Vec<VaultNote>, String> {
    let vault = vault_root(&root);
    let about_dir = vault.join("About");
    if !about_dir.exists() {
        return Ok(Vec::new());
    }
    let mut notes = Vec::new();
    let entries = fs::read_dir(&about_dir).map_err(|e| format!("read About: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(note) = parse_note(&p, &vault) {
                notes.push(note);
            }
        }
    }
    notes.sort_by(|a, b| {
        let key = |n: &VaultNote| -> (u8, String) {
            let stem = Path::new(&n.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let pri = match stem.as_str() {
                "Jake" => 0,
                "Hauck Marketing" => 1,
                _ => 2,
            };
            (pri, stem)
        };
        key(a).cmp(&key(b))
    });
    Ok(notes)
}

#[tauri::command]
pub fn read_client_notes(root: String, client_slug: String) -> Result<Vec<VaultNote>, String> {
    let clients = crate::clients::read_clients_file(&root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;

    let vault = vault_root(&root);
    let dir = vault.join("Clients").join(&client.name);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut notes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("read client dir: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(note) = parse_note(&p, &vault) {
                notes.push(note);
            }
        }
    }
    notes.sort_by(|a, b| {
        let key = |n: &VaultNote| -> (u8, String) {
            let stem = Path::new(&n.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let pri = match stem.as_str() {
                "Profile" => 0,
                "Memory" => 1,
                "Drive Index" => 2,
                _ => 3,
            };
            (pri, stem)
        };
        key(a).cmp(&key(b))
    });
    Ok(notes)
}

#[tauri::command]
pub fn find_knowledge_notes(
    root: String,
    query: KnowledgeQuery,
) -> Result<Vec<VaultNote>, String> {
    let vault = vault_root(&root);
    let knowledge = vault.join("Knowledge");
    if !knowledge.exists() {
        return Ok(Vec::new());
    }

    let q_client = query.client.as_deref().map(|s| s.to_lowercase());
    let q_agent = query.agent.as_deref().map(|s| s.to_lowercase());
    let q_tags: Vec<String> = query.tags.iter().map(|t| t.to_lowercase()).collect();
    let limit = query.limit.unwrap_or(8);

    let mut matched: Vec<VaultNote> = Vec::new();
    let entries = fs::read_dir(&knowledge).map_err(|e| format!("read Knowledge: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let note = match parse_note(&p, &vault) {
            Ok(n) => n,
            Err(_) => continue,
        };

        let note_client = note
            .front
            .client
            .as_deref()
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "all".to_string());
        let client_ok = match &q_client {
            Some(c) => note_client == "all" || note_client == *c,
            None => note_client == "all",
        };
        if !client_ok {
            continue;
        }

        let note_agent = note
            .front
            .agent
            .as_deref()
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "all".to_string());
        let agent_ok = match &q_agent {
            Some(a) => note_agent == "all" || note_agent == *a,
            None => note_agent == "all",
        };
        if !agent_ok {
            continue;
        }

        if !q_tags.is_empty() {
            let note_tags: Vec<String> =
                note.front.tags.iter().map(|t| t.to_lowercase()).collect();
            let tag_hit = q_tags.iter().any(|t| note_tags.iter().any(|n| n == t));
            if !tag_hit {
                continue;
            }
        }

        matched.push(note);
        if matched.len() >= limit {
            break;
        }
    }

    Ok(matched)
}

#[tauri::command]
pub fn list_vault_notes(root: String) -> Result<Vec<VaultNote>, String> {
    let vault = vault_root(&root);
    if !vault.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    walk_md(&vault, &vault, &mut out)?;
    Ok(out)
}

fn walk_md(dir: &Path, root: &Path, out: &mut Vec<VaultNote>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("read dir {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            walk_md(&p, root, out)?;
        } else if p.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(note) = parse_note(&p, root) {
                out.push(note);
            }
        }
    }
    Ok(())
}
