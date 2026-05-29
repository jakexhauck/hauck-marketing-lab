use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatTurn {
    pub role: String, // "user" | "agent"
    pub agent: Option<String>,
    pub at: String,   // RFC3339
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatFile {
    pub path: String,
    pub slug: String,
    pub title: String,
    pub agent: Option<String>,
    /// Client slug this chat belongs to. Chats are stored under a per-client
    /// subfolder so the right-rail history can be scoped to one client.
    #[serde(default)]
    pub client: Option<String>,
    pub started_at: String,
    pub turns: Vec<ChatTurn>,
}

/// One entry in the right-rail conversation history (no turn bodies).
#[derive(Debug, Serialize, Clone)]
pub struct ChatSummary {
    pub path: String,
    pub title: String,
    pub agent: Option<String>,
    pub started_at: String,
    pub turns: usize,
}

fn chats_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("chats")
}

/// Chats live under `chats/<client_slug>/` when a client is known, else flat in
/// `chats/`. Keeps each client's history separate.
fn chat_target_dir(root: &str, client_slug: &Option<String>) -> PathBuf {
    match client_slug {
        Some(c) if !c.trim().is_empty() => chats_dir(root).join(c.trim()),
        _ => chats_dir(root),
    }
}

pub fn slugify(s: &str) -> String {
    let lower = s.to_lowercase();
    let mut out = String::with_capacity(lower.len());
    let mut last_dash = true;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    // first 6 words / 60 chars
    let words: Vec<&str> = trimmed.split('-').filter(|w| !w.is_empty()).take(6).collect();
    let mut joined = words.join("-");
    if joined.len() > 60 {
        joined.truncate(60);
    }
    if joined.is_empty() {
        "chat".to_string()
    } else {
        joined
    }
}

fn render_turn(turn: &ChatTurn) -> String {
    let header = match turn.role.as_str() {
        "user" => "## You".to_string(),
        "agent" => match turn.agent.as_deref() {
            Some(a) if !a.is_empty() => format!("## {}", a),
            _ => "## Agent".to_string(),
        },
        other => format!("## {other}"),
    };
    format!("{header}\n<!-- at: {} -->\n\n{}\n\n", turn.at, turn.body.trim_end())
}

fn parse_turns(body: &str) -> Vec<ChatTurn> {
    let mut turns = Vec::new();
    let mut current_role: Option<String> = None;
    let mut current_agent: Option<String> = None;
    let mut current_at: String = String::new();
    let mut buf = String::new();
    let lines: Vec<&str> = body.lines().collect();

    let flush = |role: &mut Option<String>,
                 agent: &mut Option<String>,
                 at: &mut String,
                 buf: &mut String,
                 turns: &mut Vec<ChatTurn>| {
        if let Some(r) = role.take() {
            // Keep turns even when the body is empty. A freshly appended agent
            // placeholder is written with an empty body, and it must survive
            // this read-back so `replace_last_turn` targets the placeholder
            // rather than overwriting the user turn beneath it.
            turns.push(ChatTurn {
                role: r,
                agent: agent.take(),
                at: std::mem::take(at),
                body: buf.trim().to_string(),
            });
            buf.clear();
        }
    };

    for line in lines {
        if let Some(rest) = line.strip_prefix("## ") {
            flush(&mut current_role, &mut current_agent, &mut current_at, &mut buf, &mut turns);
            let trimmed = rest.trim();
            if trimmed.eq_ignore_ascii_case("you") {
                current_role = Some("user".into());
                current_agent = None;
            } else {
                current_role = Some("agent".into());
                current_agent = Some(trimmed.to_string());
            }
            current_at = String::new();
            continue;
        }
        if line.starts_with("<!-- at:") {
            if let Some(start) = line.find("at:") {
                let val = &line[start + 3..];
                let val = val.trim_end_matches("-->").trim();
                current_at = val.to_string();
            }
            continue;
        }
        buf.push_str(line);
        buf.push('\n');
    }
    flush(&mut current_role, &mut current_agent, &mut current_at, &mut buf, &mut turns);
    turns
}

fn render_file(file: &ChatFile) -> String {
    let mut s = String::new();
    s.push_str("---\n");
    s.push_str(&format!("title: \"{}\"\n", file.title.replace('"', "\\\"")));
    if let Some(a) = &file.agent {
        s.push_str(&format!("agent: {a}\n"));
    }
    if let Some(c) = &file.client {
        if !c.is_empty() {
            s.push_str(&format!("client: {c}\n"));
        }
    }
    s.push_str(&format!("started_at: {}\n", file.started_at));
    s.push_str(&format!("slug: {}\n", file.slug));
    s.push_str("---\n\n");
    for t in &file.turns {
        s.push_str(&render_turn(t));
    }
    s
}

#[tauri::command]
pub fn create_chat(
    app: AppHandle,
    root: String,
    agent: Option<String>,
    title: String,
    client_slug: Option<String>,
) -> Result<ChatFile, String> {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let slug = slugify(&title);
    let dir = chat_target_dir(&root, &client_slug);
    fs::create_dir_all(&dir).map_err(|e| format!("create chats dir: {e}"))?;

    // ensure unique
    let mut final_slug = slug.clone();
    let mut n = 2;
    loop {
        let p = dir.join(format!("{date}-{final_slug}.md"));
        if !p.exists() {
            break;
        }
        final_slug = format!("{slug}-{n}");
        n += 1;
    }
    let path = dir.join(format!("{date}-{final_slug}.md"));

    let started_at = chrono::Local::now().to_rfc3339();
    let normalized_client = client_slug.and_then(|c| {
        let t = c.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    let file = ChatFile {
        path: path.to_string_lossy().into_owned(),
        slug: format!("{date}-{final_slug}"),
        title,
        agent,
        client: normalized_client,
        started_at,
        turns: Vec::new(),
    };
    let rendered = render_file(&file);
    fs::write(&path, rendered).map_err(|e| format!("write chat: {e}"))?;
    emit_changed(&app, DataKind::Chat, None, Some(file.path.clone()));
    Ok(file)
}

#[tauri::command]
pub fn read_chat(path: String) -> Result<ChatFile, String> {
    let p = Path::new(&path);
    let raw = fs::read_to_string(p).map_err(|e| format!("read chat: {e}"))?;
    let slug = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();

    let (front_yaml, body) = match crate::frontmatter::split(&raw) {
        Some(v) => v,
        None => (String::new(), raw.clone()),
    };

    #[derive(Deserialize, Default)]
    struct FM {
        title: Option<String>,
        agent: Option<String>,
        client: Option<String>,
        started_at: Option<String>,
        slug: Option<String>,
    }
    let front: FM = if front_yaml.is_empty() {
        FM::default()
    } else {
        serde_yaml::from_str(&front_yaml).unwrap_or_default()
    };

    let turns = parse_turns(&body);
    Ok(ChatFile {
        path: path.clone(),
        slug: front.slug.unwrap_or(slug.clone()),
        title: front.title.unwrap_or_else(|| slug.replace('-', " ")),
        agent: front.agent,
        client: front.client,
        started_at: front.started_at.unwrap_or_default(),
        turns,
    })
}

/// List past conversations for a client (and optionally one agent), newest
/// first. Backs the right-rail history. Scans `chats/<client_slug>/`.
#[tauri::command]
pub fn list_chats(
    root: String,
    client_slug: Option<String>,
    agent: Option<String>,
) -> Result<Vec<ChatSummary>, String> {
    let dir = chat_target_dir(&root, &client_slug);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read chats dir: {e}"))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let file = match read_chat(path.to_string_lossy().into_owned()) {
            Ok(f) => f,
            Err(_) => continue,
        };
        if let Some(a) = &agent {
            if file.agent.as_deref() != Some(a.as_str()) {
                continue;
            }
        }
        out.push(ChatSummary {
            path: file.path,
            title: file.title,
            agent: file.agent,
            started_at: file.started_at,
            turns: file.turns.len(),
        });
    }
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(out)
}

#[tauri::command]
pub fn append_turn(app: AppHandle, path: String, turn: ChatTurn) -> Result<(), String> {
    let p = Path::new(&path);
    let mut file = read_chat(path.clone())?;
    file.turns.push(turn);
    let rendered = render_file(&file);
    fs::write(p, rendered).map_err(|e| format!("write chat: {e}"))?;
    emit_changed(&app, DataKind::Chat, None, Some(path));
    Ok(())
}

#[tauri::command]
pub fn replace_last_turn(app: AppHandle, path: String, turn: ChatTurn) -> Result<(), String> {
    let p = Path::new(&path);
    let mut file = read_chat(path.clone())?;
    if let Some(last) = file.turns.last_mut() {
        *last = turn;
    } else {
        file.turns.push(turn);
    }
    let rendered = render_file(&file);
    fs::write(p, rendered).map_err(|e| format!("write chat: {e}"))?;
    emit_changed(&app, DataKind::Chat, None, Some(path));
    Ok(())
}

/// Delete a single conversation file. Guarded so it can only remove a `.md`
/// file that lives somewhere under a `chats` directory. It will never touch an
/// arbitrary path handed in from the frontend.
#[tauri::command]
pub fn delete_chat(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.extension().and_then(|s| s.to_str()) != Some("md") {
        return Err("refusing to delete: not a chat file".into());
    }
    let under_chats = p
        .ancestors()
        .any(|a| a.file_name().and_then(|s| s.to_str()) == Some("chats"));
    if !under_chats {
        return Err("refusing to delete: not inside a chats folder".into());
    }
    if !p.exists() {
        return Ok(()); // already gone, treat as success so the UI stays in sync
    }
    fs::remove_file(p).map_err(|e| format!("delete chat: {e}"))?;
    emit_changed(&app, DataKind::Chat, None, Some(path));
    Ok(())
}
