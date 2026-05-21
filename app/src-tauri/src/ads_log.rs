/*!
 * Per-client ads activity log. The optimizer engine on the JS side calls these
 * commands every 6 hours to (a) append the day's per-ad snapshot to a CSV file
 * in the vault, and (b) read back the last N days of history when computing
 * verdicts (so the WATCH-streak / SCALE-cooldown logic has real data instead
 * of empty defaults).
 *
 * Storage layout: `vault/Clients/<Client Name>/ads-log/YYYY-MM.csv`. One file
 * per month per client. Append-only — never rewrites old rows. Header is
 * written once when the file is first created.
 *
 * Why CSV and not a DB:
 *   - The whole app's "no DB, folder = source of truth" pact (see CLAUDE.md).
 *   - Obsidian opens these cleanly. Jake can audit them by eye.
 *   - The vault is git-synced, so the log syncs across machines for free.
 */

use crate::clients::read_clients_file;
use crate::vault::vault_root;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const CSV_HEADER: &str = "ts,date,ad_id,ad_name,campaign_id,campaign_name,ad_set_id,ad_set_name,spend,results,cpl,ctr,cpm,frequency,age_hours,parent_ad_set_budget,verdict,verdict_reason,action_taken\n";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdsLogRow {
    /// ISO8601 timestamp the row was written.
    pub ts: String,
    /// YYYY-MM-DD; same calendar day as `ts`.
    pub date: String,
    pub ad_id: String,
    pub ad_name: String,
    pub campaign_id: String,
    pub campaign_name: String,
    pub ad_set_id: String,
    pub ad_set_name: String,
    pub spend: f64,
    pub results: i64,
    pub cpl: f64,
    pub ctr: f64,
    pub cpm: f64,
    pub frequency: f64,
    pub age_hours: f64,
    pub parent_ad_set_budget: f64,
    /// One of: KILL | WATCH | SCALE | REFRESH | HOLD_LEARNING |
    /// HOLD_YOUNG | HOLD_COOLDOWN | HOLD_LOW_SPEND | HOLD_NO_TARGET | OK.
    pub verdict: String,
    pub verdict_reason: String,
    /// Empty string when no action was taken. Otherwise: "paused" |
    /// "scaled-25pct" | "refresh-launched" | similar.
    #[serde(default)]
    pub action_taken: String,
}

/// Escape a single CSV cell. Wraps in double-quotes when the value contains
/// a comma, quote, or newline; doubles any embedded quotes.
fn csv_cell(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        let escaped = value.replace('"', "\"\"");
        format!("\"{escaped}\"")
    } else {
        value.to_string()
    }
}

fn row_to_csv_line(r: &AdsLogRow) -> String {
    let cells = [
        r.ts.as_str(),
        r.date.as_str(),
        r.ad_id.as_str(),
        r.ad_name.as_str(),
        r.campaign_id.as_str(),
        r.campaign_name.as_str(),
        r.ad_set_id.as_str(),
        r.ad_set_name.as_str(),
    ];
    let nums = format!(
        "{},{},{},{},{},{},{},{}",
        r.spend,
        r.results,
        r.cpl,
        r.ctr,
        r.cpm,
        r.frequency,
        r.age_hours,
        r.parent_ad_set_budget,
    );
    let mut line: Vec<String> = cells.iter().map(|c| csv_cell(c)).collect();
    line.push(nums);
    line.push(csv_cell(&r.verdict));
    line.push(csv_cell(&r.verdict_reason));
    line.push(csv_cell(&r.action_taken));
    let mut joined = line.join(",");
    joined.push('\n');
    joined
}

fn parse_csv_line(line: &str) -> Option<AdsLogRow> {
    // Minimal CSV parser: handles quoted cells with embedded commas/quotes
    // and the doubled-quote escape used by `csv_cell`. We control both the
    // writer and reader so this doesn't need to handle malformed inputs.
    let mut cells: Vec<String> = Vec::with_capacity(19);
    let mut buf = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    buf.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                buf.push(c);
            }
        } else if c == ',' {
            cells.push(std::mem::take(&mut buf));
        } else if c == '"' && buf.is_empty() {
            in_quotes = true;
        } else if c == '\n' || c == '\r' {
            // tolerated only on the last cell
        } else {
            buf.push(c);
        }
    }
    cells.push(buf);

    if cells.len() < 19 {
        return None;
    }
    let parse_f = |s: &str| s.parse::<f64>().unwrap_or(0.0);
    let parse_i = |s: &str| s.parse::<i64>().unwrap_or(0);
    Some(AdsLogRow {
        ts: cells[0].clone(),
        date: cells[1].clone(),
        ad_id: cells[2].clone(),
        ad_name: cells[3].clone(),
        campaign_id: cells[4].clone(),
        campaign_name: cells[5].clone(),
        ad_set_id: cells[6].clone(),
        ad_set_name: cells[7].clone(),
        spend: parse_f(&cells[8]),
        results: parse_i(&cells[9]),
        cpl: parse_f(&cells[10]),
        ctr: parse_f(&cells[11]),
        cpm: parse_f(&cells[12]),
        frequency: parse_f(&cells[13]),
        age_hours: parse_f(&cells[14]),
        parent_ad_set_budget: parse_f(&cells[15]),
        verdict: cells[16].clone(),
        verdict_reason: cells[17].clone(),
        action_taken: cells.get(18).cloned().unwrap_or_default(),
    })
}

fn client_log_dir(root: &str, client_slug: &str) -> Result<PathBuf, String> {
    let clients = read_clients_file(root)?;
    let client = clients
        .iter()
        .find(|c| c.slug == client_slug)
        .ok_or_else(|| format!("No client with slug '{client_slug}'."))?;
    let vault = vault_root(root);
    Ok(vault.join("Clients").join(&client.name).join("ads-log"))
}

fn ym_from_date(date: &str) -> Option<String> {
    // expects YYYY-MM-DD
    if date.len() < 7 {
        return None;
    }
    Some(date[..7].to_string())
}

#[tauri::command]
pub fn write_ads_log_snapshot(
    root: String,
    client_slug: String,
    rows: Vec<AdsLogRow>,
) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }
    let dir = client_log_dir(&root, &client_slug)?;
    fs::create_dir_all(&dir).map_err(|e| format!("create ads-log dir: {e}"))?;

    // Group rows by YYYY-MM so a snapshot spanning a month boundary lands in
    // the right files. In practice every row in one call shares a date.
    let mut by_month: std::collections::BTreeMap<String, Vec<&AdsLogRow>> =
        std::collections::BTreeMap::new();
    for row in &rows {
        let ym = ym_from_date(&row.date).ok_or_else(|| {
            format!("Row has malformed date '{}', expected YYYY-MM-DD.", row.date)
        })?;
        by_month.entry(ym).or_default().push(row);
    }

    let mut total_written = 0usize;
    for (ym, month_rows) in by_month {
        let path = dir.join(format!("{ym}.csv"));
        let exists = path.exists();
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("open log file: {e}"))?;
        if !exists {
            file.write_all(CSV_HEADER.as_bytes())
                .map_err(|e| format!("write header: {e}"))?;
        }
        for row in month_rows {
            let line = row_to_csv_line(row);
            file.write_all(line.as_bytes())
                .map_err(|e| format!("write row: {e}"))?;
            total_written += 1;
        }
    }
    Ok(total_written)
}

#[tauri::command]
pub fn read_ads_log(
    root: String,
    client_slug: String,
    days_back: u32,
) -> Result<Vec<AdsLogRow>, String> {
    let dir = match client_log_dir(&root, &client_slug) {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let cutoff = chrono_iso_days_ago(days_back);

    let mut out: Vec<AdsLogRow> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("read ads-log dir: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("csv") {
            continue;
        }
        let content = match fs::read_to_string(&p) {
            Ok(s) => s,
            Err(_) => continue,
        };
        for (i, line) in content.lines().enumerate() {
            if i == 0 && line.starts_with("ts,") {
                continue; // header
            }
            if line.trim().is_empty() {
                continue;
            }
            if let Some(row) = parse_csv_line(line) {
                if row.date.as_str() >= cutoff.as_str() {
                    out.push(row);
                }
            }
        }
    }
    out.sort_by(|a, b| a.ts.cmp(&b.ts));
    Ok(out)
}

/// Compute the YYYY-MM-DD that is `days_back` days before today (UTC).
/// Hand-rolled to avoid pulling chrono just for one date subtraction.
fn chrono_iso_days_ago(days_back: u32) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let target = now - (days_back as i64) * 86_400;
    iso_date_from_unix(target)
}

fn iso_date_from_unix(secs: i64) -> String {
    // Days since 1970-01-01 (UTC), valid for any reasonable date this app
    // will ever see. Algorithm from Howard Hinnant's "date" library.
    let days = (secs.div_euclid(86_400)) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u8;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u8;
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}
