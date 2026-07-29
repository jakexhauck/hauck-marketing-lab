use crate::frontmatter;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const CHUNK_BODY_CAP: usize = 1500;
const CHUNKS_PER_SKILL: usize = 3;
const TOTAL_CHUNK_CAP: usize = 6;
const TOP_SKILL_CAP: usize = 2;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RouterPattern {
    pub skill: String,
    pub agent: Option<String>,
    pub confidence: f64,
    pub priority: i64,
    pub pattern: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RouterIndex {
    pub patterns: Vec<RouterPattern>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeChunk {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub body: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
struct ChunkFrontmatter {
    id: Option<String>,
    title: Option<String>,
    tags: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RouterEntry {
    #[serde(default)]
    patterns: Vec<String>,
    skill: Option<String>,
    agent: Option<String>,
    #[serde(default)]
    confidence: Option<f64>,
    #[serde(default)]
    priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct RouterRoot {
    semantic_triggers: Option<HashMap<String, Vec<RouterEntry>>>,
}

// Skill ID -> relevant knowledge tags (substring/keyword match against chunk tags).
fn skill_tag_map() -> Vec<(&'static str, &'static [&'static str])> {
    vec![
        ("metric-diagnosis", &["metrics", "cpa", "roas", "ctr", "cpm", "diagnosis", "problems"]),
        ("tracking-audit", &["pixel", "capi", "emq", "match-rate", "conversion", "meta"]),
        ("creative-fatigue-detector", &["creative", "creative-fatigue", "refresh", "frameworks", "hooks"]),
        ("funnel-analysis", &["conversion", "funnel", "metrics", "checklist"]),
        ("attribution-analysis", &["pixel", "capi", "match-rate", "meta", "metrics"]),
        ("hook-generator", &["hooks", "creative", "dsl", "framework", "frameworks", "content"]),
        ("copy-generator", &["creative", "framework", "frameworks", "content", "marketing"]),
        ("creative-brief", &["creative", "frameworks", "hooks", "framework"]),
        ("angle-generator", &["creative", "frameworks", "hooks", "framework", "content"]),
        ("dsl-structure", &["dsl", "high-ticket", "frameworks", "framework", "sales"]),
        ("kill-scale-rules", &["kill-scale", "scaling", "roas", "cpa", "readiness", "metrics"]),
        ("budget-allocation", &["scaling", "campaign-structure", "kill-scale", "advantage-plus"]),
        ("audience-expansion", &["segmentation", "advantage-plus", "scaling", "meta-ads", "facebook"]),
        ("funnel-selection", &["high-ticket", "pricing", "economics", "marketing", "agency"]),
        ("unit-economics", &["economics", "ltv", "cac", "pricing", "high-ticket"]),
        ("scale-readiness-check", &["readiness", "scaling", "kill-scale", "checklist", "roas"]),
        ("campaign-structure", &["campaign-structure", "advantage-plus", "meta-ads", "facebook", "scaling"]),
        ("campaign-monitor", &["metrics", "kill-scale", "checklist", "scaling"]),
    ]
}

fn tags_for_skill(skill: &str) -> Vec<&'static str> {
    skill_tag_map()
        .into_iter()
        .find(|(s, _)| *s == skill)
        .map(|(_, tags)| tags.to_vec())
        .unwrap_or_default()
}

fn read_router(root: &Path) -> Result<RouterIndex, String> {
    let p = root.join("skills").join("_skill-router.yaml");
    let raw = fs::read_to_string(&p).map_err(|e| format!("read router: {e}"))?;
    let parsed: RouterRoot =
        serde_yaml::from_str(&raw).map_err(|e| format!("parse router yaml: {e}"))?;
    let mut patterns = Vec::new();
    if let Some(groups) = parsed.semantic_triggers {
        for (_category, entries) in groups {
            for entry in entries {
                let Some(skill) = entry.skill else { continue };
                let confidence = entry.confidence.unwrap_or(0.8);
                let priority = entry.priority.unwrap_or(2);
                for pat in entry.patterns {
                    patterns.push(RouterPattern {
                        skill: skill.clone(),
                        agent: entry.agent.clone(),
                        confidence,
                        priority,
                        pattern: pat,
                    });
                }
            }
        }
    }
    Ok(RouterIndex { patterns })
}

fn parse_tags(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|t| t.trim().trim_matches(|c: char| c == '[' || c == ']').to_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

fn read_chunk(path: &Path) -> Option<KnowledgeChunk> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = frontmatter::parse::<ChunkFrontmatter>(&raw)?;
    let id = parsed.front.id.unwrap_or_else(|| {
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string()
    });
    let title = parsed.front.title.unwrap_or_else(|| id.clone());
    let tags = parsed.front.tags.as_deref().map(parse_tags).unwrap_or_default();
    let body = parsed.body.trim().to_string();
    Some(KnowledgeChunk {
        id,
        title,
        tags,
        body,
        path: path.to_string_lossy().into_owned(),
    })
}

fn load_chunks(root: &Path) -> Vec<KnowledgeChunk> {
    let dir = root.join("knowledge");
    let mut chunks = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !name.starts_with("TFC-") {
                continue;
            }
            if let Some(c) = read_chunk(&p) {
                chunks.push(c);
            }
        }
    }
    chunks
}

fn truncate_body(body: &str, cap: usize) -> String {
    if body.len() <= cap {
        return body.to_string();
    }
    let mut end = cap;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &body[..end])
}

#[tauri::command]
pub fn parse_skill_router(root: String) -> Result<RouterIndex, String> {
    read_router(&PathBuf::from(&root))
}

#[tauri::command]
pub fn read_knowledge_chunk(root: String, chunk_id: String) -> Result<KnowledgeChunk, String> {
    let root_path = PathBuf::from(&root);
    let dir = root_path.join("knowledge");
    let safe_id = chunk_id.trim();
    if safe_id.is_empty() {
        return Err("chunk_id is empty".to_string());
    }
    let candidate = dir.join(format!("{}.md", safe_id));
    let chunk = if candidate.exists() {
        read_chunk(&candidate).ok_or_else(|| format!("failed to parse chunk: {}", safe_id))?
    } else {
        load_chunks(&root_path)
            .into_iter()
            .find(|c| c.id == safe_id)
            .ok_or_else(|| format!("chunk not found: {}", safe_id))?
    };
    Ok(chunk)
}

#[tauri::command]
pub fn match_knowledge_chunks(
    root: String,
    user_input: String,
) -> Result<Vec<KnowledgeChunk>, String> {
    let root_path = PathBuf::from(&root);
    let router = read_router(&root_path)?;
    let input_lower = user_input.to_lowercase();

    let mut skill_scores: HashMap<String, f64> = HashMap::new();
    for pat in &router.patterns {
        let re = match Regex::new(&format!("(?i){}", pat.pattern)) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if re.is_match(&input_lower) {
            let priority_weight = match pat.priority {
                0 => 3.0,
                1 => 2.0,
                _ => 1.0,
            };
            let score = pat.confidence * priority_weight;
            let entry = skill_scores.entry(pat.skill.clone()).or_insert(0.0);
            if score > *entry {
                *entry = score;
            }
        }
    }

    if skill_scores.is_empty() {
        return Ok(Vec::new());
    }

    let mut ranked: Vec<(String, f64)> = skill_scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_skills: Vec<String> = ranked.into_iter().take(TOP_SKILL_CAP).map(|(s, _)| s).collect();

    let chunks = load_chunks(&root_path);
    let mut chosen: Vec<KnowledgeChunk> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for skill in &top_skills {
        let wanted = tags_for_skill(skill);
        if wanted.is_empty() {
            continue;
        }
        let mut scored: Vec<(usize, &KnowledgeChunk)> = chunks
            .iter()
            .filter(|c| !seen_ids.contains(&c.id))
            .map(|c| {
                let overlap = c
                    .tags
                    .iter()
                    .filter(|t| wanted.iter().any(|w| t.contains(w) || w.contains(t.as_str())))
                    .count();
                (overlap, c)
            })
            .filter(|(n, _)| *n > 0)
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, c) in scored.into_iter().take(CHUNKS_PER_SKILL) {
            if chosen.len() >= TOTAL_CHUNK_CAP {
                break;
            }
            seen_ids.insert(c.id.clone());
            chosen.push(KnowledgeChunk {
                id: c.id.clone(),
                title: c.title.clone(),
                tags: c.tags.clone(),
                body: truncate_body(&c.body, CHUNK_BODY_CAP),
                path: c.path.clone(),
            });
        }
        if chosen.len() >= TOTAL_CHUNK_CAP {
            break;
        }
    }

    Ok(chosen)
}
