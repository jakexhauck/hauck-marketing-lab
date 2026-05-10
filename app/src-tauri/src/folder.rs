use crate::frontmatter;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentSummary {
    pub slug: String,
    pub name: String,
    pub initial: String,
    pub short: String,
    pub role: Option<String>,
    pub description: Option<String>,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSummary {
    pub slug: String,
    pub title: String,
    pub agent: Option<String>,
    pub started_at: Option<String>,
    pub modified_at: String,
    pub preview: Option<String>,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderSummary {
    pub root: String,
    pub agents: Vec<AgentSummary>,
    pub chats: Vec<ChatSummary>,
    pub knowledge_count: usize,
    pub skill_count: usize,
}

#[derive(Debug, Deserialize)]
struct AgentFrontmatter {
    name: Option<String>,
    short: Option<String>,
    role: Option<String>,
    description: Option<String>,
    #[serde(rename = "shortName")]
    short_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatFrontmatter {
    title: Option<String>,
    agent: Option<String>,
    started_at: Option<String>,
    slug: Option<String>,
}

fn title_case(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().chain(chars).collect(),
    }
}

fn read_agent(path: &Path) -> Option<AgentSummary> {
    let slug = path.file_stem()?.to_str()?.to_string();
    let raw = fs::read_to_string(path).ok()?;
    let parsed = frontmatter::parse::<AgentFrontmatter>(&raw);
    let (name, role, description, short_opt) = match parsed {
        Some(p) => (
            p.front.name.unwrap_or_else(|| title_case(&slug)),
            p.front.role,
            p.front.description,
            p.front.short.or(p.front.short_name),
        ),
        None => (title_case(&slug), None, None, None),
    };
    let initial = name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default();
    let short = short_opt.unwrap_or_else(|| {
        let upper: String = name.chars().take(5).flat_map(|c| c.to_uppercase()).collect();
        upper
    });
    Some(AgentSummary {
        slug,
        name,
        initial,
        short,
        role,
        description,
        path: path.to_string_lossy().into_owned(),
    })
}

fn read_chat_summary(path: &Path) -> Option<ChatSummary> {
    let slug = path.file_stem()?.to_str()?.to_string();
    let raw = fs::read_to_string(path).ok()?;
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            let secs = d.as_secs() as i64;
            chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    let (front, body) = match frontmatter::parse::<ChatFrontmatter>(&raw) {
        Some(p) => (Some(p.front), p.body),
        None => (None, raw.clone()),
    };

    let title = front
        .as_ref()
        .and_then(|f| f.title.clone())
        .unwrap_or_else(|| slug.replace('-', " "));
    let agent = front.as_ref().and_then(|f| f.agent.clone());
    let started_at = front.as_ref().and_then(|f| f.started_at.clone());

    // preview: first user line that isn't a heading
    let preview = body
        .lines()
        .find(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
        .map(|s| {
            let trimmed = s.trim();
            if trimmed.len() > 120 {
                format!("{}…", &trimmed[..120])
            } else {
                trimmed.to_string()
            }
        });

    Some(ChatSummary {
        slug,
        title,
        agent,
        started_at,
        modified_at: modified,
        preview,
        path: path.to_string_lossy().into_owned(),
    })
}

fn count_files(dir: &Path, ext: &str) -> usize {
    if !dir.exists() {
        return 0;
    }
    walk_count(dir, ext)
}

fn walk_count(dir: &Path, ext: &str) -> usize {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                n += walk_count(&p, ext);
            } else if p.extension().and_then(|e| e.to_str()) == Some(ext) {
                n += 1;
            }
        }
    }
    n
}

#[tauri::command]
pub fn parse_folder(root: String) -> Result<FolderSummary, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() || !root_path.is_dir() {
        return Err(format!("folder does not exist or is not a directory: {root}"));
    }

    let agents_dir = root_path.join("agents");
    let mut agents = Vec::new();
    if agents_dir.exists() {
        if let Ok(rd) = fs::read_dir(&agents_dir) {
            let mut entries: Vec<_> = rd.flatten().collect();
            entries.sort_by_key(|e| e.file_name());
            for entry in entries {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) == Some("md") {
                    if let Some(a) = read_agent(&p) {
                        agents.push(a);
                    }
                }
            }
        }
    }

    let chats_dir = root_path.join("chats");
    let mut chats = Vec::new();
    if chats_dir.exists() {
        if let Ok(rd) = fs::read_dir(&chats_dir) {
            for entry in rd.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) == Some("md") {
                    if let Some(c) = read_chat_summary(&p) {
                        chats.push(c);
                    }
                }
            }
        }
    }
    chats.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    let knowledge_count = count_files(&root_path.join("knowledge"), "md");
    let skill_count = count_files(&root_path.join("skills"), "md");

    Ok(FolderSummary {
        root: root_path.to_string_lossy().into_owned(),
        agents,
        chats,
        knowledge_count,
        skill_count,
    })
}

#[tauri::command]
pub fn read_agent_body(root: String, slug: String) -> Result<String, String> {
    let p = PathBuf::from(&root).join("agents").join(format!("{slug}.md"));
    fs::read_to_string(&p).map_err(|e| format!("read agent {slug}: {e}"))
}
