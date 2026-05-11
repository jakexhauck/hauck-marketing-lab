// Per-client benchmark sets.
//
// Each client may reference a YAML file from `media-buying/skills/data/`
// named `benchmarks-*.yaml`. The KPI strip on the dashboard reads its
// "bench" sub-labels from the selected file. If a client has no benchmark
// set selected, the UI falls back to the hardcoded `card.meta` strings in
// `Kpis.tsx` — so the feature is purely additive.
//
// We deliberately extract only the few strings the dashboard cards
// actually render (cpm_band, ctr_band, …). The benchmark YAML files can
// have very different overall shapes (the brasil file is pt-BR and
// challenge-funnel oriented; the new us-local-lead-gen file is en/USD).
// `ParsedBenchmarks` is intentionally minimal so different file shapes
// can populate it. Anything not present stays None and the card falls
// back to its hardcoded default.
//
// Title-parsing strategy: we prefer an explicit top-level `title:` key
// when present (most reliable, machine-readable). Failing that, we take
// the first non-empty comment line stripped of its leading `#`. This is
// documented in the spec.

use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use std::fs;
use std::path::PathBuf;

use crate::clients::read_clients_file;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BenchmarkSummary {
    /// Filename only (e.g. `benchmarks-us-local-lead-gen.yaml`). Used as the
    /// stored reference on `ClientEntry.benchmarks`.
    pub filename: String,
    /// Human-readable title for the dropdown.
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ParsedBenchmarks {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spend_cap: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpm_band: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctr_band: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cvr_band: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cpa_band: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roas_band: Option<String>,
}

fn benchmarks_dir(root: &str) -> PathBuf {
    PathBuf::from(root)
        .join("media-buying")
        .join("skills")
        .join("data")
}

fn parse_title(raw: &str, filename: &str) -> String {
    // Pass 1: try a top-level `title:` key on the YAML root.
    if let Ok(Value::Mapping(map)) = serde_yaml::from_str::<Value>(raw) {
        if let Some(Value::String(s)) = map.get(Value::String("title".to_string())) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    // Pass 2: first non-empty comment line.
    for line in raw.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix('#') {
            let stripped = rest.trim();
            if !stripped.is_empty() {
                return stripped.to_string();
            }
        } else if !trimmed.is_empty() {
            // Hit content before any comment — stop scanning.
            break;
        }
    }

    // Pass 3: filename fallback (strip prefix + extension, prettify).
    let base = filename
        .strip_prefix("benchmarks-")
        .unwrap_or(filename)
        .strip_suffix(".yaml")
        .unwrap_or(filename);
    base.replace('-', " ")
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().chain(chars).collect(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn list_benchmark_sets(root: String) -> Result<Vec<BenchmarkSummary>, String> {
    let dir = benchmarks_dir(&root);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("read benchmarks dir: {e}"))?;
    let mut out: Vec<BenchmarkSummary> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with("benchmarks-") || !name.ends_with(".yaml") {
            continue;
        }
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let title = parse_title(&raw, name);
        out.push(BenchmarkSummary {
            filename: name.to_string(),
            title,
        });
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}

fn get_string(map: &serde_yaml::Mapping, key: &str) -> Option<String> {
    map.get(Value::String(key.to_string())).and_then(|v| match v {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        _ => None,
    })
}

/// Best-effort extraction from a benchmark YAML doc. Looks first at a
/// `kpi_strip:` mapping (the new file uses this — exact match, zero
/// guesswork). Falls back to inferring strings from nested structures
/// if needed (e.g. brasil-style file). Anything that can't be resolved
/// stays None.
fn extract_parsed(raw: &str) -> ParsedBenchmarks {
    let Ok(doc) = serde_yaml::from_str::<Value>(raw) else {
        return ParsedBenchmarks::default();
    };
    let Value::Mapping(root) = doc else {
        return ParsedBenchmarks::default();
    };

    // Preferred path: kpi_strip block with exact card mapping.
    if let Some(Value::Mapping(strip)) = root.get(Value::String("kpi_strip".into())) {
        return ParsedBenchmarks {
            spend_cap: get_string(strip, "spend_cap"),
            cpm_band: get_string(strip, "cpm_band"),
            ctr_band: get_string(strip, "ctr_band"),
            cvr_band: get_string(strip, "cvr_band"),
            cpa_band: get_string(strip, "cpa_band"),
            roas_band: get_string(strip, "roas_band"),
        };
    }

    // No kpi_strip block — leave everything None so the UI falls back to
    // hardcoded defaults. Different shapes (e.g. brasil's pt-BR
    // por_objetivo > conversoes) don't map cleanly to "$X–$Y" bench
    // labels without authorial decisions, and the spec explicitly says
    // partial/None is acceptable.
    ParsedBenchmarks::default()
}

#[tauri::command]
pub fn read_benchmarks_for_client(
    root: String,
    client_slug: String,
) -> Result<Option<ParsedBenchmarks>, String> {
    let clients = read_clients_file(&root)?;
    let Some(client) = clients.into_iter().find(|c| c.slug == client_slug) else {
        return Ok(None);
    };
    let Some(filename) = client.benchmarks else {
        return Ok(None);
    };
    let path = benchmarks_dir(&root).join(&filename);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read benchmarks: {e}"))?;
    Ok(Some(extract_parsed(&raw)))
}
