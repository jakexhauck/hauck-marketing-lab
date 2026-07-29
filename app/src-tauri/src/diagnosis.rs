use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::events::{emit_changed, DataKind};

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosisVerdict {
    Kill,
    Hold,
    Scale,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosisFindingSeverity {
    High,
    Med,
    Low,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiagnosisFinding {
    pub severity: DiagnosisFindingSeverity,
    pub attribution: String,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DiagnosisInputs {
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
    #[serde(default)]
    pub frequency: Option<f64>,
    #[serde(default)]
    pub creatives_active: Option<u32>,
    #[serde(default)]
    pub paste_dump: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiagnosisFile {
    pub client: String,
    pub created_at: String,
    pub verdict: DiagnosisVerdict,
    pub scale_score: u8,
    pub headline: String,
    pub body: String,
    pub findings: Vec<DiagnosisFinding>,
    pub inputs: DiagnosisInputs,
    pub transcript: String,
    pub path: String,
}

fn diagnoses_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("outputs").join("diagnoses")
}

// Extract the FIRST ```json ... ``` fenced block. We do this manually rather than
// regex so that newlines inside the JSON body are preserved verbatim.
fn extract_json_block(src: &str) -> Option<String> {
    let lower = src;
    let start_marker = "```json";
    let start = lower.find(start_marker)?;
    let after = &src[start + start_marker.len()..];
    let after = after.strip_prefix('\n').unwrap_or(after);
    let end = after.find("```")?;
    Some(after[..end].trim().to_string())
}

fn first_paragraph(src: &str) -> String {
    for para in src.split("\n\n") {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Skip a leading fenced block when looking for headline fallback
        if trimmed.starts_with("```") {
            continue;
        }
        let one_line: String = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
        if one_line.len() > 240 {
            return format!("{}…", &one_line[..240]);
        }
        return one_line;
    }
    "Diagnosis recorded.".to_string()
}

fn parse_verdict(value: Option<&Value>) -> DiagnosisVerdict {
    match value.and_then(|v| v.as_str()).map(|s| s.to_lowercase()) {
        Some(s) if s == "kill" => DiagnosisVerdict::Kill,
        Some(s) if s == "scale" => DiagnosisVerdict::Scale,
        _ => DiagnosisVerdict::Hold,
    }
}

fn parse_severity(value: Option<&Value>) -> DiagnosisFindingSeverity {
    match value.and_then(|v| v.as_str()).map(|s| s.to_lowercase()) {
        Some(s) if s == "high" => DiagnosisFindingSeverity::High,
        Some(s) if s == "low" => DiagnosisFindingSeverity::Low,
        _ => DiagnosisFindingSeverity::Med,
    }
}

fn parse_findings(value: Option<&Value>) -> Vec<DiagnosisFinding> {
    let arr = match value.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Vec::new(),
    };
    arr.iter()
        .filter_map(|f| {
            let body = f.get("body").and_then(|v| v.as_str())?.trim().to_string();
            if body.is_empty() {
                return None;
            }
            let attribution = f
                .get("attribution")
                .and_then(|v| v.as_str())
                .unwrap_or("AURELIUS")
                .to_string();
            Some(DiagnosisFinding {
                severity: parse_severity(f.get("severity")),
                attribution,
                body,
            })
        })
        .collect()
}

fn clamp_score(score: i64) -> u8 {
    score.clamp(0, 100) as u8
}

fn build_frontmatter(file: &DiagnosisFile) -> String {
    let mut s = String::new();
    s.push_str("---\n");
    s.push_str(&format!("client: {}\n", file.client));
    s.push_str(&format!("created_at: {}\n", file.created_at));
    let verdict = match file.verdict {
        DiagnosisVerdict::Kill => "kill",
        DiagnosisVerdict::Hold => "hold",
        DiagnosisVerdict::Scale => "scale",
    };
    s.push_str(&format!("verdict: {}\n", verdict));
    s.push_str(&format!("scale_score: {}\n", file.scale_score));
    s.push_str(&format!("headline: {}\n", yaml_quote(&file.headline)));
    s.push_str(&format!("body: {}\n", yaml_quote(&file.body)));

    s.push_str("findings:\n");
    if file.findings.is_empty() {
        // Empty list — keep key present for downstream parsers.
        s.push_str("  []\n");
    } else {
        for f in &file.findings {
            let sev = match f.severity {
                DiagnosisFindingSeverity::High => "high",
                DiagnosisFindingSeverity::Med => "med",
                DiagnosisFindingSeverity::Low => "low",
            };
            s.push_str(&format!("  - severity: {}\n", sev));
            s.push_str(&format!("    attribution: {}\n", yaml_quote(&f.attribution)));
            s.push_str(&format!("    body: {}\n", yaml_quote(&f.body)));
        }
    }

    s.push_str("inputs:\n");
    push_opt_num(&mut s, "spend", file.inputs.spend);
    push_opt_num(&mut s, "cpm", file.inputs.cpm);
    push_opt_num(&mut s, "ctr", file.inputs.ctr);
    push_opt_num(&mut s, "cvr", file.inputs.cvr);
    push_opt_num(&mut s, "cpa", file.inputs.cpa);
    push_opt_num(&mut s, "roas", file.inputs.roas);
    push_opt_num(&mut s, "frequency", file.inputs.frequency);
    if let Some(c) = file.inputs.creatives_active {
        s.push_str(&format!("  creatives_active: {}\n", c));
    }
    if let Some(p) = &file.inputs.paste_dump {
        if !p.trim().is_empty() {
            s.push_str("  paste_dump: |\n");
            for line in p.lines() {
                s.push_str(&format!("    {}\n", line));
            }
        }
    }

    s.push_str("---\n\n");
    s
}

fn push_opt_num(s: &mut String, key: &str, value: Option<f64>) {
    if let Some(v) = value {
        s.push_str(&format!("  {}: {}\n", key, v));
    }
}

// Quote any string that could trip serde_yaml's plain-scalar parser when read back.
// We always quote to keep things simple and stable.
fn yaml_quote(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    let single_line: String = escaped.lines().collect::<Vec<_>>().join(" ");
    format!("\"{}\"", single_line)
}

#[tauri::command]
pub fn save_diagnosis(
    app: AppHandle,
    root: String,
    client_slug: String,
    inputs: DiagnosisInputs,
    agent_response: String,
) -> Result<DiagnosisFile, String> {
    let json_str = extract_json_block(&agent_response);
    let parsed: Option<Value> = json_str.as_deref().and_then(|s| serde_json::from_str(s).ok());

    let verdict = parsed
        .as_ref()
        .map(|v| parse_verdict(v.get("verdict")))
        .unwrap_or(DiagnosisVerdict::Hold);
    let scale_score = parsed
        .as_ref()
        .and_then(|v| v.get("scale_score"))
        .and_then(|v| v.as_i64())
        .map(clamp_score)
        .unwrap_or(50);
    let headline_fallback = first_paragraph(&agent_response);
    let headline = parsed
        .as_ref()
        .and_then(|v| v.get("headline"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| headline_fallback.clone());
    let body = parsed
        .as_ref()
        .and_then(|v| v.get("body"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| headline.clone());
    let findings = parsed
        .as_ref()
        .map(|v| parse_findings(v.get("findings")))
        .unwrap_or_default();

    let created_at = Utc::now().to_rfc3339();
    let date = Utc::now().format("%Y-%m-%d").to_string();

    let dir = diagnoses_dir(&root);
    fs::create_dir_all(&dir).map_err(|e| format!("create dirs: {e}"))?;

    // Collision-safe filename: append -2, -3 within the same date.
    let mut path = dir.join(format!("{date}-{client_slug}.md"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{date}-{client_slug}-{n}.md"));
        n += 1;
    }

    let mut file = DiagnosisFile {
        client: client_slug.clone(),
        created_at,
        verdict,
        scale_score,
        headline,
        body,
        findings,
        inputs,
        transcript: agent_response.clone(),
        path: path.to_string_lossy().into_owned(),
    };

    let mut contents = build_frontmatter(&file);
    contents.push_str("# Full Zenith transcript\n\n");
    contents.push_str(agent_response.trim_end());
    contents.push('\n');

    fs::write(&path, contents).map_err(|e| format!("write diagnosis: {e}"))?;
    file.path = path.to_string_lossy().into_owned();
    emit_changed(
        &app,
        DataKind::Diagnosis,
        Some(client_slug.clone()),
        Some(file.path.clone()),
    );
    Ok(file)
}

#[derive(Debug, Deserialize)]
struct DiagnosisFrontmatter {
    client: Option<String>,
    created_at: Option<String>,
    verdict: Option<String>,
    scale_score: Option<i64>,
    headline: Option<String>,
    body: Option<String>,
    #[serde(default)]
    findings: Vec<FindingFm>,
    inputs: Option<DiagnosisInputs>,
}

#[derive(Debug, Deserialize)]
struct FindingFm {
    severity: Option<String>,
    attribution: Option<String>,
    body: Option<String>,
}

#[tauri::command]
pub fn read_latest_diagnosis(
    root: String,
    client_slug: String,
) -> Result<Option<DiagnosisFile>, String> {
    let dir = diagnoses_dir(&root);
    if !dir.exists() {
        return Ok(None);
    }
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read diagnoses dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !file_name.ends_with(".md") {
            continue;
        }
        // Match files of the form YYYY-MM-DD-<slug>[-N].md for this client.
        // Filename minus extension splits into [date(3 parts), slug+suffix...].
        let stem = file_name.trim_end_matches(".md");
        let parts: Vec<&str> = stem.splitn(4, '-').collect();
        if parts.len() < 4 {
            continue;
        }
        let date_prefix = format!("{}-{}-{}", parts[0], parts[1], parts[2]);
        let rest = parts[3];
        // rest is "<slug>" or "<slug>-N"; ensure it starts with the requested slug
        let matches_slug = rest == client_slug || rest.starts_with(&format!("{client_slug}-"));
        if !matches_slug {
            continue;
        }
        // sort key: filename stem (date sorts lexicographically, suffix tiebreaks)
        candidates.push((format!("{}|{}", date_prefix, stem), path));
    }
    if candidates.is_empty() {
        return Ok(None);
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    let (_, path) = &candidates[0];
    let raw = fs::read_to_string(path).map_err(|e| format!("read diagnosis: {e}"))?;
    let (front_yaml, body) = match crate::frontmatter::split(&raw) {
        Some(v) => v,
        None => return Ok(None),
    };
    let front: DiagnosisFrontmatter =
        serde_yaml::from_str(&front_yaml).map_err(|e| format!("parse diagnosis: {e}"))?;

    let verdict = match front.verdict.as_deref().map(|s| s.to_lowercase()) {
        Some(s) if s == "kill" => DiagnosisVerdict::Kill,
        Some(s) if s == "scale" => DiagnosisVerdict::Scale,
        _ => DiagnosisVerdict::Hold,
    };
    let scale_score = front
        .scale_score
        .map(clamp_score)
        .unwrap_or(50);
    let findings = front
        .findings
        .into_iter()
        .filter_map(|f| {
            let body = f.body?.trim().to_string();
            if body.is_empty() {
                return None;
            }
            let severity = match f.severity.as_deref().map(|s| s.to_lowercase()) {
                Some(s) if s == "high" => DiagnosisFindingSeverity::High,
                Some(s) if s == "low" => DiagnosisFindingSeverity::Low,
                _ => DiagnosisFindingSeverity::Med,
            };
            Some(DiagnosisFinding {
                severity,
                attribution: f.attribution.unwrap_or_else(|| "AURELIUS".to_string()),
                body,
            })
        })
        .collect();

    // Strip the "# Full Zenith transcript" header line if present, so transcript
    // round-trips cleanly for downstream display.
    let transcript = body
        .split_once("# Full Zenith transcript")
        .map(|(_, after)| after.trim_start().to_string())
        .unwrap_or_else(|| body.trim_start().to_string());

    Ok(Some(DiagnosisFile {
        client: front.client.unwrap_or(client_slug.clone()),
        created_at: front.created_at.unwrap_or_default(),
        verdict,
        scale_score,
        headline: front.headline.unwrap_or_default(),
        body: front.body.unwrap_or_default(),
        findings,
        inputs: front.inputs.unwrap_or_default(),
        transcript,
        path: path.to_string_lossy().into_owned(),
    }))
}
