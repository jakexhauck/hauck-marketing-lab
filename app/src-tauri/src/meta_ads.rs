// Meta Marketing API integration for the Ads Manager dashboard.
//
// Pulls campaign-level + ad-level insights from graph.facebook.com using the
// long-lived System User token stored in `meta_oauth_secrets.rs`. Output is
// shaped to match the TS `MetaAdsAccount` interface in `lib/mockMetaAds.ts`
// so the existing AdsManagerPage component renders real data unchanged.
//
// API ref: https://developers.facebook.com/docs/marketing-api/insights
// Base URL: https://graph.facebook.com/v21.0
//
// Disk cache lives in the app config dir under `meta_ads_cache/` with a
// 15-minute TTL so dashboard navigation doesn't burn rate limit.

use chrono::{Datelike, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::clients::read_clients_file;
use crate::config::load_config;
use crate::events::{emit_changed, DataKind};
use crate::kpi::KpiEntry;
use crate::meta_oauth_secrets::META_SYSTEM_USER_TOKEN;

const API_BASE: &str = "https://graph.facebook.com/v21.0";
const CACHE_TTL_SECS: u64 = 15 * 60;

// ── data shapes returned to the renderer ──────────────────────
//
// Field names are camelCase to match the existing TS interfaces. When the
// frontend swaps `getMockAdsAccount` for `invoke("meta_list_ads_insights")`,
// the shape is identical (down to the `totals.spend` nesting).

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MetaTotals {
    pub spend: f64,
    pub results: i64,
    pub cpr: f64,
    pub roas: f64,
    pub revenue: f64,
    pub ctr: f64,
    pub cpm: f64,
    pub frequency: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaDailyPoint {
    pub date: String,
    pub spend: f64,
    pub results: i64,
    pub revenue: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaAdCreative {
    pub id: String,
    pub name: String,
    pub format: String, // "image" | "video" | "carousel"
    pub thumb_color: String,
    pub headline: String,
    pub primary_text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaAd {
    pub id: String,
    pub name: String,
    pub status: String, // "active" | "paused" | "learning" | "off"
    pub creative: MetaAdCreative,
    pub spend: f64,
    pub impressions: i64,
    pub clicks: i64,
    pub ctr: f64,
    pub cpm: f64,
    pub cpc: f64,
    pub results: i64,
    pub cpr: f64,
    pub roas: f64,
    pub frequency: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaAdSet {
    pub id: String,
    pub name: String,
    pub status: String,
    pub audience: String,
    pub budget_daily: f64,
    pub ads: Vec<MetaAd>,
    pub spend: f64,
    pub results: i64,
    pub cpr: f64,
    pub roas: f64,
    pub frequency: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaCampaign {
    pub id: String,
    pub name: String,
    pub objective: String,
    pub status: String,
    pub budget_daily: f64,
    pub ad_sets: Vec<MetaAdSet>,
    pub spend: f64,
    pub results: i64,
    pub cpr: f64,
    pub roas: f64,
    pub ctr: f64,
    pub cpm: f64,
    pub frequency: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetaAdsAccount {
    pub account_id: String,
    pub account_name: String,
    pub currency: String,
    pub client_slug: String,
    pub client_name: String,
    pub source: String, // "connected" for real, "mock" handled in TS
    pub totals: MetaTotals,
    pub daily: Vec<MetaDailyPoint>,
    pub campaigns: Vec<MetaCampaign>,
}

// ── disk cache ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct CachedAccount {
    fetched_at_unix: u64,
    account: MetaAdsAccount,
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?
        .join("meta_ads_cache");
    fs::create_dir_all(&dir).map_err(|e| format!("create cache dir: {e}"))?;
    Ok(dir)
}

fn read_cache(path: &PathBuf) -> Option<MetaAdsAccount> {
    let raw = fs::read_to_string(path).ok()?;
    let cached: CachedAccount = serde_json::from_str(&raw).ok()?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
    if now.saturating_sub(cached.fetched_at_unix) > CACHE_TTL_SECS {
        return None;
    }
    Some(cached.account)
}

fn write_cache(path: &PathBuf, account: &MetaAdsAccount) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let payload = CachedAccount {
        fetched_at_unix: now,
        account: account.clone(),
    };
    if let Ok(raw) = serde_json::to_string(&payload) {
        let _ = fs::write(path, raw);
    }
}

// ── HTTP helpers ──────────────────────────────────────────────

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .expect("reqwest build")
}

async fn graph_get(path: &str, query: &[(&str, &str)]) -> Result<Value, String> {
    if META_SYSTEM_USER_TOKEN.is_empty() {
        return Err(
            "Meta System User token not configured — paste it into meta_oauth_secrets.rs".into(),
        );
    }
    let url = format!("{API_BASE}{path}");
    let mut params: Vec<(&str, &str)> = query.to_vec();
    params.push(("access_token", META_SYSTEM_USER_TOKEN));
    let resp = http()
        .get(&url)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Meta GET {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Meta GET {path} ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Meta parse {path}: {e} — body: {text}"))
}

// ── insights → camelCase conversion ───────────────────────────
//
// Meta returns spend/impressions/clicks as strings; `actions` is an array of
// `{action_type, value}`. Pull the most common conversion action types so the
// dashboard can show a `results` count without per-client config. When a
// client uses a non-standard action type, the value falls back to clicks.

fn f64_field(v: &Value, k: &str) -> f64 {
    match v.get(k) {
        Some(Value::String(s)) => s.parse().unwrap_or(0.0),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn i64_field(v: &Value, k: &str) -> i64 {
    match v.get(k) {
        Some(Value::String(s)) => s.parse().unwrap_or(0),
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        _ => 0,
    }
}

fn string_field(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

const CONVERSION_ACTIONS: &[&str] = &[
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_lead",
    "lead",
    "leadgen.other",
    "onsite_conversion.lead_grouped",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
];

fn extract_actions_value(node: &Value, key: &str, override_action: Option<&str>) -> f64 {
    let Some(arr) = node.get(key).and_then(|v| v.as_array()) else {
        return 0.0;
    };
    let mut total: f64 = 0.0;
    for entry in arr {
        let action_type = entry.get("action_type").and_then(|v| v.as_str()).unwrap_or("");
        let matches = match override_action {
            Some(target) => action_type == target,
            None => CONVERSION_ACTIONS.contains(&action_type),
        };
        if matches {
            let val: f64 = entry
                .get("value")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0);
            total += val;
        }
    }
    total
}

fn round2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

fn since_until(window_days: u32) -> (String, String) {
    let today = Utc::now().date_naive();
    let since = today - Duration::days(window_days.max(1) as i64 - 1);
    (since.format("%Y-%m-%d").to_string(), today.format("%Y-%m-%d").to_string())
}

/// Build the `action_attribution_windows` JSON-array string for the
/// Marketing API. Accepts ["7d_click","1d_view"] etc; defaults to
/// 7d-click + 1d-view (Meta's own default).
fn attribution_windows_param(custom: Option<&[String]>) -> String {
    let default_windows = vec!["7d_click".to_string(), "1d_view".to_string()];
    let windows = custom.unwrap_or(&default_windows);
    let quoted: Vec<String> = windows.iter().map(|w| format!("\"{w}\"")).collect();
    format!("[{}]", quoted.join(","))
}

fn normalize_ad_account_id(raw: &str) -> String {
    if raw.starts_with("act_") {
        raw.to_string()
    } else {
        format!("act_{raw}")
    }
}

// Parse a single insights row from Meta's response into the totals shape.
fn row_to_totals(row: &Value, conv_override: Option<&str>) -> MetaTotals {
    let spend = f64_field(row, "spend");
    let impressions = i64_field(row, "impressions");
    let clicks = i64_field(row, "clicks");
    let ctr = f64_field(row, "ctr");
    let cpm = f64_field(row, "cpm");
    let frequency = f64_field(row, "frequency");
    let results = extract_actions_value(row, "actions", conv_override) as i64;
    let revenue = extract_actions_value(row, "action_values", conv_override);
    let cpr = if results > 0 { spend / results as f64 } else { 0.0 };
    let roas = if spend > 0.0 { revenue / spend } else { 0.0 };
    MetaTotals {
        spend: round2(spend),
        results,
        cpr: round2(cpr),
        roas: round2(roas),
        revenue: round2(revenue),
        ctr: round2(ctr),
        cpm: round2(cpm),
        frequency: round2(frequency),
        // unused fields kept for completeness
        ..Default::default()
    }
    .with_clicks_impressions(clicks, impressions)
}

impl MetaTotals {
    // Helper kept inline so we don't need a separate struct just to thread
    // clicks/impressions through (the totals struct doesn't expose them, but
    // we need them transiently to compute campaign-level CTR/CPM upstream).
    fn with_clicks_impressions(self, _clicks: i64, _impressions: i64) -> Self {
        self
    }
}

// ── fetch one ad account ──────────────────────────────────────

pub struct FetchOpts<'a> {
    pub client_slug: &'a str,
    pub client_name: &'a str,
    pub window_days: u32,
    pub start_date: Option<&'a str>,
    pub end_date: Option<&'a str>,
    pub attribution_windows: Option<&'a [String]>,
    pub conversion_action: Option<&'a str>,
}

async fn fetch_account(
    ad_account_id: &str,
    opts: &FetchOpts<'_>,
) -> Result<MetaAdsAccount, String> {
    let act = normalize_ad_account_id(ad_account_id);
    let (since, until) = match (opts.start_date, opts.end_date) {
        (Some(s), Some(e)) if !s.is_empty() && !e.is_empty() => (s.to_string(), e.to_string()),
        _ => since_until(opts.window_days),
    };
    let time_range = format!("{{\"since\":\"{since}\",\"until\":\"{until}\"}}");
    let attr_windows = attribution_windows_param(opts.attribution_windows);
    let conv_override = opts.conversion_action;

    // 1. Account metadata (currency, name)
    let meta = graph_get(
        &format!("/{act}"),
        &[("fields", "id,name,currency,account_status")],
    )
    .await?;
    let currency = string_field(&meta, "currency");
    let account_name = string_field(&meta, "name");

    // 2. Account-level totals for the window
    let totals_resp = graph_get(
        &format!("/{act}/insights"),
        &[
            ("level", "account"),
            ("time_range", &time_range),
            ("action_attribution_windows", &attr_windows),
            (
                "fields",
                "spend,impressions,clicks,ctr,cpm,frequency,actions,action_values",
            ),
        ],
    )
    .await?;
    let totals = totals_resp
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|a| a.first())
        .map(|r| row_to_totals(r, conv_override))
        .unwrap_or_default();

    // 3. Daily breakdown for the chart
    let daily_resp = graph_get(
        &format!("/{act}/insights"),
        &[
            ("level", "account"),
            ("time_range", &time_range),
            ("time_increment", "1"),
            ("action_attribution_windows", &attr_windows),
            (
                "fields",
                "spend,actions,action_values,date_start",
            ),
        ],
    )
    .await?;
    let daily: Vec<MetaDailyPoint> = daily_resp
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .map(|row| {
                    let spend = f64_field(row, "spend");
                    let results = extract_actions_value(row, "actions", conv_override) as i64;
                    let revenue = extract_actions_value(row, "action_values", conv_override);
                    MetaDailyPoint {
                        date: string_field(row, "date_start"),
                        spend: round2(spend),
                        results,
                        revenue: round2(revenue),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    // 4. Campaign-level rows (powers the table)
    let campaigns_resp = graph_get(
        &format!("/{act}/insights"),
        &[
            ("level", "campaign"),
            ("time_range", &time_range),
            ("action_attribution_windows", &attr_windows),
            (
                "fields",
                "campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,cpm,frequency,actions,action_values",
            ),
            ("limit", "200"),
        ],
    )
    .await?;

    // 5. Ad-level rows (powers the detail rail)
    let ads_resp = graph_get(
        &format!("/{act}/insights"),
        &[
            ("level", "ad"),
            ("time_range", &time_range),
            ("action_attribution_windows", &attr_windows),
            (
                "fields",
                "campaign_id,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpm,cpc,frequency,actions,action_values",
            ),
            ("limit", "500"),
        ],
    )
    .await?;

    // 6. Campaign/ad metadata (status, daily budget) — separate calls because
    // insights endpoints don't return status/budget. Keyed by campaign_id /
    // ad_id so we can attach below.
    let camp_meta_resp = graph_get(
        &format!("/{act}/campaigns"),
        &[
            ("fields", "id,name,status,effective_status,daily_budget,objective"),
            ("limit", "200"),
        ],
    )
    .await?;
    let ad_meta_resp = graph_get(
        &format!("/{act}/ads"),
        &[
            (
                "fields",
                "id,name,status,effective_status,adset_id,campaign_id,creative{id,name,thumbnail_url,object_story_spec}",
            ),
            ("limit", "500"),
        ],
    )
    .await?;

    let campaigns = build_campaigns(
        &campaigns_resp,
        &ads_resp,
        &camp_meta_resp,
        &ad_meta_resp,
        conv_override,
    );

    let account = MetaAdsAccount {
        account_id: act,
        account_name: if account_name.is_empty() {
            format!("{} - Meta Ads", opts.client_name)
        } else {
            account_name
        },
        currency: if currency.is_empty() { "USD".into() } else { currency },
        client_slug: opts.client_slug.into(),
        client_name: opts.client_name.into(),
        source: "connected".into(),
        totals,
        daily,
        campaigns,
    };
    Ok(account)
}

// ── campaign assembly ─────────────────────────────────────────

fn status_from(effective: &str) -> String {
    let lower = effective.to_lowercase();
    if lower.contains("active") {
        "active".into()
    } else if lower.contains("paused") {
        "paused".into()
    } else if lower.contains("learning") {
        "learning".into()
    } else {
        "off".into()
    }
}

fn build_campaigns(
    campaign_insights: &Value,
    ad_insights: &Value,
    campaign_meta: &Value,
    ad_meta: &Value,
    conv_override: Option<&str>,
) -> Vec<MetaCampaign> {
    // Index metadata by id for fast attach.
    let mut camp_status: std::collections::HashMap<String, (String, String, f64, String)> =
        std::collections::HashMap::new(); // id -> (name, status, daily_budget, objective)
    if let Some(arr) = campaign_meta.get("data").and_then(|d| d.as_array()) {
        for row in arr {
            let id = string_field(row, "id");
            let name = string_field(row, "name");
            let eff = string_field(row, "effective_status");
            let objective = string_field(row, "objective");
            // daily_budget is in cents (string)
            let budget = f64_field(row, "daily_budget") / 100.0;
            camp_status.insert(id, (name, status_from(&eff), budget, objective));
        }
    }

    let mut ad_status: std::collections::HashMap<String, (String, String, String, String, MetaAdCreative)> =
        std::collections::HashMap::new(); // ad_id -> (name, status, adset_id, campaign_id, creative)
    if let Some(arr) = ad_meta.get("data").and_then(|d| d.as_array()) {
        for row in arr {
            let id = string_field(row, "id");
            let name = string_field(row, "name");
            let eff = string_field(row, "effective_status");
            let adset_id = string_field(row, "adset_id");
            let campaign_id = string_field(row, "campaign_id");
            let creative = parse_creative(row.get("creative").cloned().unwrap_or(Value::Null), &id);
            ad_status.insert(id, (name, status_from(&eff), adset_id, campaign_id, creative));
        }
    }

    // Build ads grouped by campaign_id → adset_id.
    let mut ads_by_adset: std::collections::HashMap<String, Vec<MetaAd>> =
        std::collections::HashMap::new();
    let mut adset_to_campaign: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut adset_names: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    if let Some(arr) = ad_insights.get("data").and_then(|d| d.as_array()) {
        for row in arr {
            let ad_id = string_field(row, "ad_id");
            let adset_id = string_field(row, "adset_id");
            let campaign_id = string_field(row, "campaign_id");
            let adset_name = string_field(row, "adset_name");
            if !adset_id.is_empty() {
                adset_to_campaign.insert(adset_id.clone(), campaign_id.clone());
                if !adset_name.is_empty() {
                    adset_names.insert(adset_id.clone(), adset_name);
                }
            }

            let spend = f64_field(row, "spend");
            let impressions = i64_field(row, "impressions");
            let clicks = i64_field(row, "clicks");
            let ctr = f64_field(row, "ctr");
            let cpm = f64_field(row, "cpm");
            let cpc = f64_field(row, "cpc");
            let frequency = f64_field(row, "frequency");
            let results = extract_actions_value(row, "actions", conv_override) as i64;
            let revenue = extract_actions_value(row, "action_values", conv_override);
            let cpr = if results > 0 { spend / results as f64 } else { 0.0 };
            let roas = if spend > 0.0 { revenue / spend } else { 0.0 };

            let (name, status, creative) = match ad_status.get(&ad_id) {
                Some((n, s, _, _, c)) => (n.clone(), s.clone(), c.clone()),
                None => (
                    format!("Ad {ad_id}"),
                    "off".into(),
                    placeholder_creative(&ad_id),
                ),
            };

            ads_by_adset
                .entry(adset_id)
                .or_default()
                .push(MetaAd {
                    id: ad_id,
                    name,
                    status,
                    creative,
                    spend: round2(spend),
                    impressions,
                    clicks,
                    ctr: round2(ctr),
                    cpm: round2(cpm),
                    cpc: round2(cpc),
                    results,
                    cpr: round2(cpr),
                    roas: round2(roas),
                    frequency: round2(frequency),
                });
        }
    }

    // Build campaigns from campaign-level insights, attaching adsets+ads.
    let mut out: Vec<MetaCampaign> = Vec::new();
    if let Some(arr) = campaign_insights.get("data").and_then(|d| d.as_array()) {
        for row in arr {
            let campaign_id = string_field(row, "campaign_id");
            let insights_name = string_field(row, "campaign_name");

            let (name, status, daily_budget, objective) = camp_status
                .get(&campaign_id)
                .cloned()
                .map(|(n, s, b, o)| {
                    (
                        if n.is_empty() { insights_name.clone() } else { n },
                        s,
                        b,
                        if o.is_empty() { string_field(row, "objective") } else { o },
                    )
                })
                .unwrap_or_else(|| {
                    (
                        insights_name,
                        "off".into(),
                        0.0,
                        string_field(row, "objective"),
                    )
                });

            let spend = f64_field(row, "spend");
            let impressions = i64_field(row, "impressions");
            let clicks = i64_field(row, "clicks");
            let ctr = f64_field(row, "ctr");
            let cpm = f64_field(row, "cpm");
            let frequency = f64_field(row, "frequency");
            let results = extract_actions_value(row, "actions", conv_override) as i64;
            let revenue = extract_actions_value(row, "action_values", conv_override);
            let cpr = if results > 0 { spend / results as f64 } else { 0.0 };
            let roas = if spend > 0.0 { revenue / spend } else { 0.0 };

            // Group this campaign's adsets.
            let mut ad_sets: Vec<MetaAdSet> = Vec::new();
            for (adset_id, ads) in ads_by_adset.iter() {
                if adset_to_campaign.get(adset_id) != Some(&campaign_id) {
                    continue;
                }
                let adset_spend: f64 = ads.iter().map(|a| a.spend).sum();
                let adset_results: i64 = ads.iter().map(|a| a.results).sum();
                let adset_freq: f64 = if ads.is_empty() {
                    0.0
                } else {
                    ads.iter().map(|a| a.frequency).sum::<f64>() / ads.len() as f64
                };
                let adset_roas: f64 = if ads.is_empty() {
                    0.0
                } else {
                    ads.iter().map(|a| a.roas).sum::<f64>() / ads.len() as f64
                };
                let adset_cpr = if adset_results > 0 {
                    adset_spend / adset_results as f64
                } else {
                    0.0
                };
                let adset_name = adset_names
                    .get(adset_id)
                    .cloned()
                    .unwrap_or_else(|| format!("Ad set {adset_id}"));
                ad_sets.push(MetaAdSet {
                    id: adset_id.clone(),
                    name: adset_name.clone(),
                    status: "active".into(),
                    audience: adset_name,
                    budget_daily: 0.0,
                    ads: ads.clone(),
                    spend: round2(adset_spend),
                    results: adset_results,
                    cpr: round2(adset_cpr),
                    roas: round2(adset_roas),
                    frequency: round2(adset_freq),
                });
            }
            // Stable order by spend desc.
            ad_sets.sort_by(|a, b| b.spend.partial_cmp(&a.spend).unwrap_or(std::cmp::Ordering::Equal));

            out.push(MetaCampaign {
                id: campaign_id,
                name,
                objective,
                status,
                budget_daily: round2(daily_budget),
                ad_sets,
                spend: round2(spend),
                results,
                cpr: round2(cpr),
                roas: round2(roas),
                ctr: round2(ctr),
                cpm: round2(cpm),
                frequency: round2(frequency),
            });
            let _ = (impressions, clicks); // already encoded in ctr/cpm
        }
    }
    out.sort_by(|a, b| b.spend.partial_cmp(&a.spend).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn parse_creative(v: Value, ad_id: &str) -> MetaAdCreative {
    if v.is_null() {
        return placeholder_creative(ad_id);
    }
    let id = string_field(&v, "id");
    let name = string_field(&v, "name");

    // Try to dig a headline/primary text out of object_story_spec.
    let spec = v.get("object_story_spec").cloned().unwrap_or(Value::Null);
    let mut headline = String::new();
    let mut primary = String::new();
    let mut format = "image".to_string();

    if let Some(link) = spec.get("link_data") {
        headline = string_field(link, "name");
        primary = string_field(link, "message");
        if link.get("child_attachments").is_some() {
            format = "carousel".into();
        }
    }
    if let Some(video) = spec.get("video_data") {
        headline = string_field(video, "title");
        primary = string_field(video, "message");
        format = "video".into();
    }

    MetaAdCreative {
        id,
        name,
        format,
        thumb_color: color_for(ad_id),
        headline,
        primary_text: primary,
    }
}

fn placeholder_creative(ad_id: &str) -> MetaAdCreative {
    MetaAdCreative {
        id: format!("cr-{ad_id}"),
        name: String::new(),
        format: "image".into(),
        thumb_color: color_for(ad_id),
        headline: String::new(),
        primary_text: String::new(),
    }
}

fn color_for(seed: &str) -> String {
    const PALETTE: &[&str] = &["#FF6B00", "#5fe699", "#38bdf8", "#a78bfa", "#f59e0b", "#ec9849", "#22d3ee"];
    let mut h: u32 = 2166136261;
    for b in seed.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    PALETTE[(h as usize) % PALETTE.len()].to_string()
}

// ── Tauri command ─────────────────────────────────────────────

#[tauri::command]
pub async fn meta_list_ads_insights(
    app: AppHandle,
    ad_account_id: String,
    client_slug: String,
    client_name: String,
    window_days: u32,
    force_refresh: Option<bool>,
    start_date: Option<String>,
    end_date: Option<String>,
    attribution_windows: Option<Vec<String>>,
    conversion_action: Option<String>,
    root: Option<String>,
) -> Result<MetaAdsAccount, String> {
    let window = if window_days == 0 { 7 } else { window_days };

    // Cache key includes the range + attribution + conversion override so
    // different views don't collide on the same file.
    let range_hint = match (&start_date, &end_date) {
        (Some(s), Some(e)) if !s.is_empty() && !e.is_empty() => format!("{s}_{e}"),
        _ => format!("{window}d"),
    };
    let attr_hint = attribution_windows
        .as_ref()
        .map(|w| w.join("-"))
        .unwrap_or_else(|| "default".into());
    let conv_hint = conversion_action
        .as_deref()
        .unwrap_or("allowlist");
    let cache_key = format!("{range_hint}__{attr_hint}__{conv_hint}");
    let path = cache_dir(&app)?.join(format!(
        "{}-{}.json",
        ad_account_id.replace(['/', '\\', ':'], "_"),
        cache_key
    ));

    if !force_refresh.unwrap_or(false) {
        if let Some(cached) = read_cache(&path) {
            return Ok(cached);
        }
    }

    let opts = FetchOpts {
        client_slug: &client_slug,
        client_name: &client_name,
        window_days: window,
        start_date: start_date.as_deref(),
        end_date: end_date.as_deref(),
        attribution_windows: attribution_windows.as_deref(),
        conversion_action: conversion_action.as_deref(),
    };
    let fresh = fetch_account(&ad_account_id, &opts).await?;
    write_cache(&path, &fresh);

    // Auto-snapshot: persist a daily KPI row whenever we successfully refresh
    // a standard rolling window. We skip when a custom start/end pair is used
    // because those rows aren't comparable across days. Snapshot only when an
    // explicit `root` is provided OR app config exposes `media_buying_path`.
    let is_custom_range = matches!(
        (&start_date, &end_date),
        (Some(s), Some(e)) if !s.is_empty() && !e.is_empty()
    );
    if !is_custom_range {
        if let Some(root_str) = resolve_root(&app, root.as_deref()) {
            let window_label = window_label_for(window);
            if let Err(e) = write_snapshot(
                &app,
                &root_str,
                &client_slug,
                &fresh.totals,
                &window_label,
                None,
            ) {
                eprintln!("meta_ads: snapshot write failed for {client_slug}: {e}");
            }
        }
    }

    Ok(fresh)
}

// ── KPI snapshot helpers ──────────────────────────────────────

fn window_label_for(window_days: u32) -> String {
    match window_days {
        7 => "7d".to_string(),
        14 => "14d".to_string(),
        28 => "28d".to_string(),
        30 => "30d".to_string(),
        _ => "custom".to_string(),
    }
}

fn resolve_root(app: &AppHandle, root_arg: Option<&str>) -> Option<String> {
    if let Some(r) = root_arg {
        let trimmed = r.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    match load_config(app.clone()) {
        Ok(cfg) => cfg.media_buying_path.and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }),
        Err(_) => None,
    }
}

fn kpi_snapshot_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join("data").join("kpis")
}

fn kpi_snapshot_path(root: &str, client_slug: &str, date: &str) -> PathBuf {
    kpi_snapshot_dir(root).join(format!("{client_slug}-{date}.yaml"))
}

/// Write or upsert a `KpiEntry` for the given totals. When `date_override` is
/// `None`, today's UTC date is used. The `window` label should already be
/// formatted ("7d", "30d", "1d", "custom", ...).
fn write_snapshot(
    app: &AppHandle,
    root: &str,
    client_slug: &str,
    totals: &MetaTotals,
    window: &str,
    date_override: Option<&str>,
) -> Result<(), String> {
    let date = date_override
        .map(|s| s.to_string())
        .unwrap_or_else(|| Utc::now().date_naive().format("%Y-%m-%d").to_string());
    let path = kpi_snapshot_path(root, client_slug, &date);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create kpi dir: {e}"))?;
    }
    let entry = KpiEntry {
        client: client_slug.to_string(),
        date: date.clone(),
        window: window.to_string(),
        spend: Some(totals.spend),
        cpm: Some(totals.cpm),
        ctr: Some(totals.ctr),
        cvr: None,
        cpa: Some(totals.cpr),
        roas: Some(totals.roas),
        updated_at: Utc::now().to_rfc3339(),
    };
    let yaml = serde_yaml::to_string(&entry).map_err(|e| format!("serialize kpi: {e}"))?;
    fs::write(&path, yaml).map_err(|e| format!("write kpi: {e}"))?;
    emit_changed(
        app,
        DataKind::Kpi,
        Some(client_slug.to_string()),
        Some(path.to_string_lossy().into_owned()),
    );
    Ok(())
}

fn snapshot_exists(root: &str, client_slug: &str, date: &str) -> bool {
    kpi_snapshot_path(root, client_slug, date).exists()
}

fn client_has_any_snapshot(root: &str, client_slug: &str) -> bool {
    let dir = kpi_snapshot_dir(root);
    let prefix = format!("{client_slug}-");
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        if let Some(name) = entry.path().file_name().and_then(|n| n.to_str()) {
            if name.starts_with(&prefix) && name.ends_with(".yaml") {
                return true;
            }
        }
    }
    false
}

// ── backfill ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackfillResult {
    pub written: u32,
    pub skipped: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackfillIfNeededResult {
    pub backfilled: Vec<String>,
    pub skipped: Vec<String>,
}

/// Fetch single-day insights for the last `days` days in a single Graph API
/// call (using `time_increment=1`), then write one `KpiEntry` per day. Rows
/// that already exist on disk are skipped so the call is idempotent.
async fn backfill_account(
    app: &AppHandle,
    root: &str,
    ad_account_id: &str,
    client_slug: &str,
    days: u32,
    conversion_action: Option<&str>,
) -> Result<BackfillResult, String> {
    let window = days.max(1);
    let act = normalize_ad_account_id(ad_account_id);
    let (since, until) = since_until(window);
    let time_range = format!("{{\"since\":\"{since}\",\"until\":\"{until}\"}}");
    let attr_windows = attribution_windows_param(None);

    let resp = graph_get(
        &format!("/{act}/insights"),
        &[
            ("level", "account"),
            ("time_range", &time_range),
            ("time_increment", "1"),
            ("action_attribution_windows", &attr_windows),
            (
                "fields",
                "spend,impressions,clicks,ctr,cpm,frequency,actions,action_values,date_start",
            ),
        ],
    )
    .await?;

    let rows = resp
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();

    let mut written: u32 = 0;
    let mut skipped: u32 = 0;
    for row in rows.iter() {
        let date = string_field(row, "date_start");
        if date.is_empty() {
            continue;
        }
        if snapshot_exists(root, client_slug, &date) {
            skipped += 1;
            continue;
        }
        let totals = row_to_totals(row, conversion_action);
        match write_snapshot(app, root, client_slug, &totals, "1d", Some(&date)) {
            Ok(_) => written += 1,
            Err(e) => {
                eprintln!("meta_ads backfill: write {client_slug}-{date}: {e}");
            }
        }
    }
    Ok(BackfillResult { written, skipped })
}

#[tauri::command]
pub async fn meta_backfill_kpis(
    app: AppHandle,
    ad_account_id: String,
    client_slug: String,
    _client_name: String,
    days: Option<u32>,
    conversion_action: Option<String>,
    root: String,
) -> Result<BackfillResult, String> {
    let n = days.unwrap_or(30).max(1);
    backfill_account(
        &app,
        &root,
        &ad_account_id,
        &client_slug,
        n,
        conversion_action.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn meta_backfill_if_needed(
    app: AppHandle,
    root: String,
) -> Result<BackfillIfNeededResult, String> {
    let clients = read_clients_file(&root)?;
    let mut backfilled: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    for client in clients.iter() {
        let Some(ad_account_id) = client.meta_ad_account_id.as_deref() else {
            continue;
        };
        if ad_account_id.trim().is_empty() {
            continue;
        }
        if client_has_any_snapshot(&root, &client.slug) {
            skipped.push(client.slug.clone());
            continue;
        }
        match backfill_account(
            &app,
            &root,
            ad_account_id,
            &client.slug,
            30,
            client.meta_conversion_action.as_deref(),
        )
        .await
        {
            Ok(_) => backfilled.push(client.slug.clone()),
            Err(e) => {
                eprintln!("meta_ads auto-backfill: {} failed: {e}", client.slug);
                skipped.push(client.slug.clone());
            }
        }
    }
    Ok(BackfillIfNeededResult {
        backfilled,
        skipped,
    })
}

// Shared helper so other modules (e.g. meta_actions) can bust the cache after
// a mutation succeeds without having to reach through a Tauri command.
pub fn clear_cache_inner(app: &AppHandle) -> Result<(), String> {
    let dir = cache_dir(app)?;
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("read cache: {e}"))?.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

// Tiny utility command the renderer can use to bust the whole Meta cache
// (e.g. when the user hits "Refresh all" or switches Hauck portfolios).
#[tauri::command]
pub fn meta_clear_ads_cache(app: AppHandle) -> Result<(), String> {
    clear_cache_inner(&app)
}

// Suppress unused warning for the unused Datelike import path (kept in case
// we add per-weekday breakdowns later).
#[allow(dead_code)]
fn _today_dow() -> u32 {
    Utc::now().date_naive().weekday().num_days_from_monday()
}
