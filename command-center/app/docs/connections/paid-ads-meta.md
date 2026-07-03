# Paid Ads (Meta insights) — connections

The client Paid Ads tabs (Overview / Insights / Creatives) over the Meta
Marketing API, plus a GHL join for the ad-revenue tiles. Read-only. The Leads
tab is wired separately (GHL, see paid-ads-sales.md).

## Data source

- ✅ **Meta Marketing API** (`graph.facebook.com/v21.0`), account-level + ad-level
  insights, ported from the desktop app's `app/src-tauri/src/meta_ads.rs`
  (field lists + `CONVERSION_ACTIONS` leads parsing). Endpoint:
  `functions/api/ads/insights.ts`.
  - Overview: totals (spend, leads, cost-per-lead, impressions, reach, clicks,
    ctr, cpc) + weekly leads + running-now ads.
  - Creatives: per-ad list (name/copy/status/leads/reach/spend).
  - Insights: best ads, leads-vs-last-month, source split (publisher_platform).
- ✅ **GHL join** for "New customers", "Revenue from ads" and "Your return"
  (ROAS) on the Overview. Meta can't know which ad leads became paid jobs for a
  lead-gen business, so `functions/lib/adsRevenue.ts` counts this month's Job
  Completed opportunities whose contact carries the **`facebook ads`** tag, sums
  their opportunity `monetaryValue` (= revenue), and `roas = revenue / spend`.
  - Jake's real flow: every ad lead is tagged `facebook ads`, runs Paid Ad's
    Pipeline → Sales Pipeline, and the job value is set on the opp at Job
    Completed.
  - Sales pipeline + Job Completed stage resolved BY NAME per tenant (never by
    id). Contact tags read one contact at a time, capped at 100 newest
    completions (`truncated` flag if a client ever exceeds that; not surfaced to
    the client UI).
  - Windowed to the current month (tenant timezone) so it lines up with Meta's
    this-month spend and ROAS reads honestly. `customers`/`revenue`/`roas` are an
    honest 0/$0/0x until the first ad job completes (Jake's call: honest zeros,
    no "pending" state).
- ⚡ **Caching:** the whole payload is cached in `KV_CACHE` per
  account+location+month for 15 min (the join is several GHL round-trips).
  Skipped gracefully when no KV binding is present.

## Config (env-based for now)

- ⚠️ **`META_SYSTEM_USER_TOKEN`** — agency System-User token (one token spans all
  client ad accounts). SET AS A CF SECRET. Value lives in
  `app/src-tauri/src/meta_oauth_secrets.rs`.
  `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN <token> --secret`
- ⚠️ **`META_AD_ACCOUNT_ID`** — the live client's ad account (`act_...`).
  `node scripts/cf.mjs env:set META_AD_ACCOUNT_ID act_27110669075184924`
  - Willis Windows verified: token reaches the account (HTTP 200), 0 spend / 0
    campaigns (ads not launched yet), so the tabs correctly show zeros.
- 🔜 **Per-tenant `meta_ad_account_id`** — a future `tenants` column so each client
  maps to its own account (today it's the single env account). Add the column +
  read `ctx.data.tenant.meta_ad_account_id` with the env as fallback.

## Behavior

- Env unset -> `{ configured: false }` -> tabs show the not-connected notice.
- Env set, no spend -> honest zeros + "connected, fills in when campaigns run".
- Env set, live -> real numbers.
- Demo (`?demo=1`) -> `demoAdsInsights()` from the hand-authored demo ads.

## Known gaps (follow-ups)

- ✅ **"New customers" / ad revenue / ROAS** — DONE. Wired via the GHL join above
  (`functions/lib/adsRevenue.ts`, `facebook ads` tag → Job Completed value).
- ❌ **Real ad thumbnails** — the Creatives grid uses gradient placeholders; Meta
  `creative.thumbnail_url` is available but not hotlinked yet (CSP/format).
- ❌ **"Best time of day"** card was dropped from the real Insights view (needs an
  hourly breakdown); demo only.
- ⚠️ **Product tour** still points a step at the old synthetic `/paid-ads` raw
  dashboard (`src/lib/tourSteps.ts`); repoint it to `/marketing/paid-ads`.
- ⚠️ **Revenue window** is the current calendar month, so a job completed this
  month from an ad lead acquired earlier still counts (standard approximation).
  Revisit if Jake wants strict same-cohort attribution.
