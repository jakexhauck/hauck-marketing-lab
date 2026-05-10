use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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
    pub started_at: String,
    pub turns: Vec<ChatTurn>,
}

fn chats_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("chats")
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
            let body = buf.trim().to_string();
            if !body.is_empty() {
                turns.push(ChatTurn {
                    role: r,
                    agent: agent.take(),
                    at: std::mem::take(at),
                    body,
                });
            } else {
                *agent = None;
                *at = String::new();
            }
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
    root: String,
    agent: Option<String>,
    title: String,
) -> Result<ChatFile, String> {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let slug = slugify(&title);
    let dir = chats_dir(&root);
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
    let file = ChatFile {
        path: path.to_string_lossy().into_owned(),
        slug: format!("{date}-{final_slug}"),
        title,
        agent,
        started_at,
        turns: Vec::new(),
    };
    let rendered = render_file(&file);
    fs::write(&path, rendered).map_err(|e| format!("write chat: {e}"))?;
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
        started_at: front.started_at.unwrap_or_default(),
        turns,
    })
}

#[tauri::command]
pub fn append_turn(path: String, turn: ChatTurn) -> Result<(), String> {
    let p = Path::new(&path);
    let mut file = read_chat(path.clone())?;
    file.turns.push(turn);
    let rendered = render_file(&file);
    fs::write(p, rendered).map_err(|e| format!("write chat: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn replace_last_turn(path: String, turn: ChatTurn) -> Result<(), String> {
    let p = Path::new(&path);
    let mut file = read_chat(path.clone())?;
    if let Some(last) = file.turns.last_mut() {
        *last = turn;
    } else {
        file.turns.push(turn);
    }
    let rendered = render_file(&file);
    fs::write(p, rendered).map_err(|e| format!("write chat: {e}"))?;
    Ok(())
}
