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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInput {
    pub name: String,
    pub label: Option<String>,
    pub prompt: Option<String>,
    pub default: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillFile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub primary_agent: Option<String>,
    pub category: String,
    pub body: String,
    pub inputs: Vec<SkillInput>,
    pub path: String,
}

#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "primary-agent")]
    primary_agent: Option<String>,
    inputs: Option<Vec<SkillInput>>,
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

#[tauri::command]
pub fn load_skill(
    root: String,
    category: String,
    skill_id: String,
) -> Result<SkillFile, String> {
    let p = PathBuf::from(&root)
        .join("skills")
        .join(&category)
        .join(&skill_id)
        .join("SKILL.md");
    let raw = fs::read_to_string(&p)
        .map_err(|e| format!("read skill {category}/{skill_id}: {e}"))?;

    let (front, body) = match frontmatter::parse::<SkillFrontmatter>(&raw) {
        Some(parsed) => (Some(parsed.front), parsed.body),
        None => (None, raw.clone()),
    };

    let name = front
        .as_ref()
        .and_then(|f| f.name.clone())
        .unwrap_or_else(|| title_case(&skill_id.replace('-', " ")));
    let description = front.as_ref().and_then(|f| f.description.clone());
    let primary_agent = front.as_ref().and_then(|f| f.primary_agent.clone());
    let inputs = front
        .as_ref()
        .and_then(|f| f.inputs.clone())
        .unwrap_or_default();

    Ok(SkillFile {
        id: skill_id,
        name,
        description,
        primary_agent,
        category,
        body,
        inputs,
        path: p.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillEntry {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub activation_command: Option<String>,
    pub skill_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeTitle {
    pub id: String,
    pub title: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
struct KnowledgeFrontmatter {
    id: Option<String>,
    title: Option<String>,
}

#[tauri::command]
pub fn list_skills(root: String) -> Result<Vec<SkillEntry>, String> {
    let registry_path = PathBuf::from(&root).join("skills").join("_registry.yaml");
    let raw = fs::read_to_string(&registry_path)
        .map_err(|e| format!("read registry: {e}"))?;
    let doc: serde_yaml::Value =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse registry: {e}"))?;
    let skills_map = doc
        .get("skills")
        .and_then(|v| v.as_mapping())
        .ok_or_else(|| "registry missing skills map".to_string())?;

    let mut out = Vec::new();
    for (key, value) in skills_map {
        let id = value
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| key.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let name = value
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&id)
            .to_string();
        let description = value
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let category = value
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let activation_command = value
            .get("activation_command")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let skill_path = PathBuf::from(&root)
            .join("skills")
            .join(&category)
            .join(&id)
            .join("SKILL.md")
            .to_string_lossy()
            .into_owned();
        out.push(SkillEntry {
            id,
            name,
            description,
            category,
            activation_command,
            skill_path,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn list_knowledge_titles(root: String) -> Result<Vec<KnowledgeTitle>, String> {
    let dir = PathBuf::from(&root).join("knowledge");
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let stem = match p.file_stem().and_then(|s| s.to_str()) {
                Some(s) if s.starts_with("TFC-") => s.to_string(),
                _ => continue,
            };
            let raw = match fs::read_to_string(&p) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let parsed = frontmatter::parse::<KnowledgeFrontmatter>(&raw);
            let (id, title) = match parsed {
                Some(p) => (
                    p.front.id.unwrap_or_else(|| stem.clone()),
                    p.front.title.unwrap_or_else(|| stem.clone()),
                ),
                None => continue,
            };
            out.push(KnowledgeTitle {
                id,
                title,
                path: p.to_string_lossy().into_owned(),
            });
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}
