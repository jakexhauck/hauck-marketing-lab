# 01 — Close the Data Loop (Meta + Google Ads APIs)

> **Status:** Proposed, largest scope of the four. Open architectural
> decisions inside — confirm with Jake before coding.
> **Effort:** 2-3 days for read-only MVP (Meta first, Google next). Full
> write-capable flows are out of scope here.
> **Depends on:** 03 (Activity Log) shipped, so anomalies and pulls can log
> events. 04 (Scheduled Agents) optional but ideal — gives you the
> anomaly-scanner home.

---

## Why this matters

Half the HML agent stack is currently aspirational because it has no live
data:

- **Zenith** writes weekly + monthly report forms, but the numbers come from
  whatever Jake pastes in.
- The **data-analyst** skill is theoretical — it can analyse a CSV if you
  give it one, but it can't actually look at a client's account.
- The **anomaly scanner** in doc 04 is parked specifically because there's
  no live KPI feed.
- The **lead-scraper Meta ad-detection** is a known broken placeholder; it
  pretends to detect whether a business runs Meta ads, when in fact it
  doesn't talk to Meta at all.

Wiring Meta Ads + Google Ads APIs turns all of these from copy-paste rituals
into real, automatable systems. ROI per shipped hour is enormous — this is
the single biggest unlock on the roadmap.

The foundation memo explicitly said "no Meta Ads API in v1." That was the
right call at the time. v1 has shipped. This is the v2 keystone.

---

## Background a new terminal needs

You are working in the HML Tauri app at
`C:\Users\games\Desktop\hauck-marketing-lab\`. Universal constraints in
`recommended improvements/README.md`. Three things specific to this work:

### Existing credential pattern

Per-client credentials are already stored at the file level. See
`app/src-tauri/src/credentials.rs` and the existing
`api.readClientCredentials` / `writeClientCredentials` /
`clearClientCredentials` commands. The credentials file lives at
`vault/Clients/<name>/credentials.json` (gitignored — confirm in
`.gitignore`). **Reuse this pattern.** Do not invent a new secret store.

Also: `lead-scraper/credentials.json` is gitignored and stores Google
Places + Sheets keys. That's a different file. Don't conflate them.

### LLM-agnostic Rust

The Rust side does the network I/O. The LLM (`claude -p`) is only invoked
when interpretive work is required (summarising a numbers blob into prose,
drafting a recap). API calls themselves are plain `reqwest` from Rust. Don't
route raw Meta/Google Ads API calls through `claude -p` — too slow, too
expensive, no benefit.

### KPI surfaces that will consume this data

- `app/src-tauri/src/kpi.rs` already has `read_latest_kpis`,
  `read_kpi_history`, `write_kpi_entry`. The new Ads pulls should write KPI
  entries through `write_kpi_entry` (or its data file directly) so
  everything downstream that already reads KPIs gets the live data for
  free.
- `app/src-tauri/src/benchmarks.rs` holds per-client benchmark ranges.
  Anomaly detection compares pulls against benchmarks.

---

## Decisions already made (do not relitigate)

- **Read-only MVP.** This brief is for read-only data ingestion. No "pause
  campaigns from the app" or "edit budgets from the app." Those are
  separate, riskier projects.
- **One ingester per platform.** Two Rust modules: `meta_ads.rs` and
  `google_ads.rs`. Same shape, mirror APIs.
- **Long-lived system user tokens for Meta**, OAuth client + refresh tokens
  for Google Ads. Stored per client in
  `vault/Clients/<name>/credentials.json` under namespaced keys
  (`meta_ads.access_token`, `google_ads.refresh_token`, etc.). Tokens never
  enter the GitHub sync — that file is gitignored.
- **No third-party MCP for the API calls themselves.** Composio has Meta /
  Google Ads MCPs, but the read flows we need are not LLM-driven — they are
  scheduled background pulls. Direct HTTPS via `reqwest` is cheaper and
  simpler.
- **Pulls are append-only KPI snapshots, not a live mirror.** Each pull
  writes a timestamped row. No "current state" cache that drifts. The KPI
  file format already does this — preserve it.
- **Refresh cadence:** every 30 min for live clients during US business
  hours, every 6 hours overnight. Sensible default; user-tunable via
  per-client config later.

---

## Open decisions (confirm before coding)

1. **Meta token type.** System User access tokens (long-lived, set once per
   ad account) vs OAuth user tokens (per-client OAuth dance, refresh). For
   a solo operator with admin access to each client's Business Manager,
   System User tokens are radically simpler. Default: **System User
   tokens.** Confirm Jake has Business Manager admin on every client.
2. **Google Ads developer token.** Google Ads API requires a developer
   token tied to a Google Ads MCC (manager) account. Confirm Jake has an
   MCC, or stand one up at <https://ads.google.com/aw/accounts>. Token
   approval can take days — start the request early.
3. **Metric scope.** v2 MVP metrics per client per pull:
   - Meta: spend, impressions, clicks, CTR, CPC, purchase conversions,
     purchase conversion value, ROAS.
   - Google: spend, impressions, clicks, CTR, CPC, conversions, conversion
     value, ROAS.
   Confirm or trim. Anything more (cohort retention, video metrics, etc.)
   is v3.
4. **Aggregation level.** Pull at the account level first. Adset / campaign
   breakdowns are a richer ask — confirm whether v2 MVP needs them or just
   account-level rollups.
5. **Currency normalisation.** If clients run accounts in non-USD
   currencies, do we keep native currency or normalise to USD on read?
   Default: keep native; the report layer can convert if needed.
6. **Composio fallback.** If reqwest-based ingestion proves brittle (token
   refresh hell, version churn), allow falling back to Composio's hosted
   Meta / Google Ads tools per platform independently. Don't pre-commit to
   Composio for everything.

---

## Out of scope

- Write operations against ad platforms (pause, budget changes, creative
  uploads).
- TikTok, LinkedIn, X, Reddit, programmatic.
- Real-time push (Meta has webhook subscriptions; we poll instead).
- A per-platform OAuth flow inside the app UI. Token setup is one-time CLI
  / `setup` script work; don't build a wizard for it in v2.
- Multi-currency conversion in reports.
- Historical backfill beyond the API's free window (Meta gives 37 months,
  Google Ads roughly the same — that's enough).

---

## Target architecture

```
app/src-tauri/src/
  meta_ads.rs           <- new: Graph API client + KPI write-back
  google_ads.rs         <- new: Google Ads API client + KPI write-back
  credentials.rs        <- existing: extended with namespaced platform keys
  kpi.rs                <- existing: write_kpi_entry consumed by ingesters

vault/Clients/<name>/
  credentials.json      <- existing, gitignored. Adds platform sections:
                            {
                              "meta_ads": { "access_token": "...", "ad_account_id": "act_123" },
                              "google_ads": { "refresh_token": "...", "customer_id": "..." }
                            }

media-buying/outputs/kpis/<client>/<YYYY-MM>.jsonl
                        <- one JSONL line per pull (already the existing
                           kpi format — confirm by reading kpi.rs)

vault/ops/jobs/
  meta-ads-pull.md      <- scheduled job prompt (see 04)
  google-ads-pull.md    <- scheduled job prompt (see 04)
```

Per-pull flow:

```
Scheduled job fires (or manual "Refresh" button on a client KPI panel)
   |
   v
Read vault/Clients/<name>/credentials.json. Bail if no token.
   |
   v
Call Meta Graph API / Google Ads API for the metrics window.
   |
   v
Parse response. Build a KPI entry.
   |
   v
api.writeKpiEntry(client, entry)  -- existing path
   |
   v
appendActivity({ type: "scheduled.run", clientSlug, summary, meta: { spend, roas } })
```

Anomaly path (depends on doc 04 Step 5):

```
After write, compare to benchmarks (from benchmarks.rs)
   If outside thresholds: write vault/ops/alerts/<...>.md
   appendActivity({ type: "alert.fired", hot: true, clientSlug, summary })
```

---

## Implementation plan

### Step 0 — Set up tokens

This is the boring but blocking part. Document it in
`recommended improvements/01-close-the-data-loop-token-setup.md` as you go
(a separate setup-doc, not in this brief).

**Meta System User token:**
1. Business Manager → Settings → System Users → Add.
2. Assign assets: each client's ad account, with "Manage campaigns"
   permission (read is included).
3. Generate token → choose "Never" expiry → scopes: `ads_read`,
   `business_management`.
4. Save the token. Run a one-time helper that fetches the list of
   `act_<id>` ad accounts the token can see, and pair them with vault
   clients by hand (Profile.md gains a `meta_ad_account_id` field).

**Google Ads OAuth:**
1. Create an OAuth 2.0 client in Google Cloud Console (Desktop app type).
2. Apply for a Developer Token via the Google Ads UI (Tools → API
   Center). May take 24-72 hours.
3. Once approved, run the OAuth flow once per client account to get a
   refresh token. Save refresh token + customer ID in each client's
   `credentials.json`.

**Verification:** `vault/Clients/Willis Windows/credentials.json` has a
`meta_ads.access_token` (and once Google approves) a
`google_ads.refresh_token` + `customer_id`. Both are gitignored.

---

### Step 1 — `meta_ads.rs` module

**File:** `app/src-tauri/src/meta_ads.rs` (new)

Top-level shape:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::credentials::read_client_credentials;
use crate::kpi::{write_kpi_entry, KpiEntry};
use crate::ops_activity::{append_activity, ActivityEvent};

#[derive(Debug, Deserialize)]
struct MetaInsightsResponse {
    data: Vec<MetaInsightsRow>,
}

#[derive(Debug, Deserialize)]
struct MetaInsightsRow {
    spend: Option<String>,
    impressions: Option<String>,
    clicks: Option<String>,
    ctr: Option<String>,
    cpc: Option<String>,
    actions: Option<Vec<MetaAction>>,
    action_values: Option<Vec<MetaAction>>,
    date_start: String,
    date_stop: String,
}

#[derive(Debug, Deserialize)]
struct MetaAction { action_type: String, value: String }

const META_API: &str = "https://graph.facebook.com/v22.0";

#[tauri::command]
pub async fn pull_meta_ads(
    app: AppHandle,
    root: String,
    client_slug: String,
) -> Result<KpiEntry, String> {
    // 1. Load credentials
    let creds = read_client_credentials(root.clone(), client_slug.clone())?;
    let token = creds.meta_ads.as_ref()
        .and_then(|m| m.access_token.clone())
        .ok_or("No Meta access token configured for this client.")?;
    let acct = creds.meta_ads.as_ref()
        .and_then(|m| m.ad_account_id.clone())
        .ok_or("No Meta ad_account_id configured for this client.")?;

    // 2. Build the insights URL — last 7 days, account-level summary
    let url = format!(
        "{base}/{acct}/insights?fields=spend,impressions,clicks,ctr,cpc,actions,action_values&date_preset=last_7d&access_token={tok}",
        base = META_API, acct = acct, tok = urlencoding::encode(&token),
    );

    // 3. Fetch
    let resp: MetaInsightsResponse = reqwest::get(&url).await
        .map_err(|e| format!("Meta API request: {e}"))?
        .json().await
        .map_err(|e| format!("Meta API decode: {e}"))?;

    let row = resp.data.first()
        .ok_or("Meta returned no insights data.")?;

    // 4. Parse the row into a KpiEntry. Action types we care about for
    //    e-commerce: 'purchase' for conv count, 'purchase_value' or
    //    'offsite_conversion.fb_pixel_purchase' depending on setup.
    let conv = row.actions.as_ref()
        .map(|v| v.iter().find(|a| a.action_type == "purchase").and_then(|a| a.value.parse::<f64>().ok()).unwrap_or(0.0))
        .unwrap_or(0.0);
    let conv_value = row.action_values.as_ref()
        .map(|v| v.iter().find(|a| a.action_type == "purchase").and_then(|a| a.value.parse::<f64>().ok()).unwrap_or(0.0))
        .unwrap_or(0.0);
    let spend = row.spend.as_ref().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);

    let entry = KpiEntry {
        ts: Utc::now().to_rfc3339(),
        platform: "meta_ads".into(),
        client: client_slug.clone(),
        window_start: row.date_start.clone(),
        window_end: row.date_stop.clone(),
        spend,
        impressions: row.impressions.as_ref().and_then(|s| s.parse().ok()),
        clicks: row.clicks.as_ref().and_then(|s| s.parse().ok()),
        ctr: row.ctr.as_ref().and_then(|s| s.parse().ok()),
        cpc: row.cpc.as_ref().and_then(|s| s.parse().ok()),
        conversions: Some(conv),
        conversion_value: Some(conv_value),
        roas: if spend > 0.0 { Some(conv_value / spend) } else { None },
        source: "meta_ads_api".into(),
    };

    // 5. Write through existing KPI helper
    write_kpi_entry(root.clone(), entry.clone())?;

    // 6. Log activity
    let _ = append_activity(app.clone(), root, ActivityEvent {
        ts: None,
        kind: "scheduled.run".into(),
        summary: format!("Meta pull · {client_slug} · spend ${:.2} · ROAS {:.2}",
            spend, entry.roas.unwrap_or(0.0)),
        client_slug: Some(client_slug),
        prospect_slug: None,
        ref_path: None,
        hot: None,
        meta: Default::default(),
    });

    Ok(entry)
}
```

> Notes for the implementer:
> - The KpiEntry struct above is illustrative. Read `kpi.rs` and match the
>   real struct so this drops in cleanly. If the existing struct doesn't
>   carry `platform`, extend it (additive change, no downstream breakage).
> - The Meta API version `v22.0` is the latest stable at the time of
>   writing this brief. Use whatever is current at implementation time —
>   check <https://developers.facebook.com/docs/graph-api/changelog/>.
> - Error mapping: surface meaningful errors to the UI. "Token expired" and
>   "rate limited" are distinct user-fixable cases.

Register `mod meta_ads;` in `lib.rs`. Add `meta_ads::pull_meta_ads,` to the
handler list.

**Verification:** with valid creds in `credentials.json` for one client, run
`api.pullMetaAds(root, "willis-windows")` from DevTools. Confirm:
1. A new KPI entry is written to wherever the existing `kpi.rs` flow saves
   them (likely `media-buying/outputs/kpis/willis-windows/<...>.jsonl`).
2. The activity feed gains a `scheduled.run` entry with the spend / ROAS
   summary.
3. Calling it twice in a row does not duplicate state; each pull is its own
   timestamped entry by design.

---

### Step 2 — `google_ads.rs` module

Same shape as Meta. Differences:

- **OAuth refresh.** Before each pull, exchange the stored refresh token
  for a fresh access token via
  `POST https://oauth2.googleapis.com/token`. Cache the access token in
  memory with its expiry; refresh only when expired.
- **GAQL query.** Google Ads uses a SQL-like query language. Hit the
  `customers/{customerId}/googleAds:searchStream` endpoint with a GAQL
  body like:
  ```
  SELECT metrics.cost_micros, metrics.impressions, metrics.clicks,
         metrics.ctr, metrics.average_cpc, metrics.conversions,
         metrics.conversions_value
  FROM customer
  WHERE segments.date DURING LAST_7_DAYS
  ```
- **Developer token in `developer-token` header.** Refresh token, client
  ID, client secret in `Authorization`. Login customer ID (MCC) in
  `login-customer-id` header.
- **Micros conversion.** Costs come in `cost_micros` (1/1,000,000 of the
  account currency). Divide by 1e6 before storing.

**Verification:** as Meta. Run `api.pullGoogleAds(root, clientSlug)`,
confirm KPI entry + activity event.

---

### Step 3 — UI surfaces

Two additions:

**Per-client KPI panel.** `app/src/components/MainDashboard/ClientDashboard.tsx`
(or wherever the per-client "Media Buying" section lives — see
`ClientMediaBuying.tsx`). Add a card showing the latest pull for each
platform: window, spend, ROAS, last-pulled-at, and a "Refresh now" button
that calls `pullMetaAds` / `pullGoogleAds`. While refreshing, show a small
spinner. On error, show the error inline with a "Reconnect" link to a
help modal.

**Settings → Ad platforms.** Likely under `SettingsPage.tsx`. Lists every
client and whether they have Meta / Google Ads credentials configured.
Provides minimal documentation: "Paste your System User token and ad
account ID into this client's credentials.json at vault/Clients/<name>/."
(Manual paste — no in-app OAuth wizard yet.)

**Verification:** click "Refresh now" on a client with creds; KPI numbers
update. Click on a client without creds; see a clear "Not configured" state
with copy-able instructions.

---

### Step 4 — Wire Zenith report forms to live data

**File:** `app/src/lib/formConfigs.ts`

Find `WEEKLY_REPORT` (line ~1471) and `MONTHLY_REPORT` (line ~1627). These
currently expect the user to paste numbers into form fields. Update them to:

- Pre-fill the numeric fields from `api.readLatestKpis(clientSlug)` when
  the form opens.
- Show a small "Pulled from live data 4 min ago — refresh" link in the form
  header.

The form still allows manual override of any field — Jake should be able to
edit before generating the report.

**Verification:** open the Weekly Report form for a client with recent
pulls. Spend / ROAS / impressions are pre-populated. Generate the report;
the numbers in the output match the prefilled values.

---

### Step 5 — Scheduled pull job

Add `vault/ops/jobs/meta-ads-pull.md` (and `google-ads-pull.md`):

```
Every 30 minutes during US business hours (8am-6pm Mon-Fri Eastern),
every 6 hours otherwise.

For each client at vault/Clients/* whose Profile.md status == "live":
  Call the Tauri command pull_meta_ads for the client.
  (If the command is not reachable from /schedule, fall back to running
  the equivalent fetch via a small Python helper script in
  media-buying/scripts/pull_meta.py — that script reads credentials.json
  and writes KPI entries directly.)

Append one scheduled.run event per platform with summary
"Meta pull cycle: refreshed N clients" / "Google pull cycle: refreshed N
clients" and meta.failures = M if any fail.
```

Schedule pattern: `*/30 8-18 * * 1-5` for business hours; a second
schedule `0 */6 * * 0,6` for weekends. (Cron pattern syntax tolerant —
verify against `/schedule`.)

**Verification:** after the first business-hour fire, every live client has
a fresh KPI entry within ~5 minutes of the cron tick. Activity feed shows
the cycle summary.

---

### Step 6 — (Optional, depends on 04 Step 5) Anomaly scanner

Once pulls are happening, the anomaly scanner job (parked in doc 04 Step 5)
can be activated. Wiring:

- Read the latest 2 KPI entries per platform per client.
- Compare against the rolling 7-day baseline already stored.
- Check against client-specific benchmarks from `benchmarks.rs`.
- If outside thresholds, write to `vault/ops/alerts/`.
- Append `{type: "alert.fired", hot: true, clientSlug, summary, refPath}`
  to `activity.jsonl`.

---

### Step 7 — Fix lead-scraper Meta detection

This is a small follow-on, but worth doing in the same PR as Meta API
wiring since it shares the credential / token plumbing:

**Memory note `project_lead_scraper.md`** says Meta ad-detection in
`lead-scraper/scrape.py` is a broken placeholder. The fix: swap it for
real Meta Ad Library API calls
(<https://www.facebook.com/ads/library/api/>). The Ad Library API is
**unauthenticated for public ads** — no per-client token needed, just the
system user token (any valid Meta token works for the public Ad Library).

Update `lead-scraper/scrape.py` to call:

```
GET https://graph.facebook.com/v22.0/ads_archive
  ?search_terms=<business_name>
  &ad_type=ALL
  &ad_reached_countries=US
  &access_token=<token>
```

If the response has ads, mark the lead `runs_meta_ads = true`. Otherwise
false. Cache results per business to avoid hammering the API.

**Verification:** run the lead scraper for a known business that runs Meta
ads (e.g. one of Jake's competitors). The "runs Meta ads" column shows
true.

---

## Testing plan

1. **Unit-level.** For each platform, a small Rust test that mocks an HTTP
   response and asserts the parsed `KpiEntry` matches expectations. If the
   codebase doesn't already have a Rust test harness, skip — manual
   verification via DevTools is acceptable for an MVP.
2. **Integration: real token, real account.**
   - Confirm a pull succeeds end-to-end.
   - Confirm numbers match what Ads Manager / Google Ads UI shows for the
     same window (within rounding).
3. **Auth failure path.** Manually expire / corrupt a token. Confirm the UI
   surfaces a clear error and the activity log gets a `scheduled.run` with
   `meta.failures = 1`.
4. **Multiple clients.** With 2+ clients configured, confirm one bad client
   (broken token) doesn't block the others from pulling.
5. **Idempotency.** Trigger 5 pulls in 5 minutes. Confirm KPI history has
   5 entries (one per pull) and no duplicates / no corruption.

---

## How to verify this shipped

- [ ] At least one client has a working Meta access token in their
      credentials.json.
- [ ] At least one client has a working Google Ads OAuth refresh token.
- [ ] "Refresh now" on the per-client KPI panel pulls real numbers in
      under 5 seconds.
- [ ] The Weekly Report form prefills numeric fields from live data.
- [ ] Scheduled pulls fire on the configured cadence; activity feed shows
      it.
- [ ] At least one full day has passed where Jake didn't have to type a
      single ad-platform number into the app manually.
- [ ] Lead scraper correctly identifies businesses running Meta ads
      against a known-good test set.
- [ ] Token errors surface as clear in-app messages, not console warnings.
