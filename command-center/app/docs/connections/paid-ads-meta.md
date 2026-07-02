# Paid Ads (Meta insights) — connections

The client Paid Ads tabs (Overview / Insights / Creatives) over the Meta
Marketing API. Read-only. The Leads tab is wired separately (GHL, see
paid-ads-sales.md).

## Data source

- ✅ **Meta Marketing API** (`graph.facebook.com/v21.0`), account-level + ad-level
  insights, ported from the desktop app's `app/src-tauri/src/meta_ads.rs`
  (field lists + `CONVERSION_ACTIONS` leads/revenue parsing). Endpoint:
  `functions/api/ads/insights.ts`.
  - Overview: totals (spend, leads, cost-per-lead, impressions, reach, clicks,
    ctr, cpc) + weekly leads + running-now ads.
  - Creatives: per-ad list (name/copy/status/leads/reach/spend).
  - Insights: best ads, leads-vs-last-month, source split (publisher_platform).

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

- ❌ **"New customers" / true ad revenue / ROAS** need a GHL join (ad leads ->
  won jobs -> revenue) that Meta can't provide for a lead-gen business. Today
  `customers` is 0 and `revenue`/`roas` are Meta's own conversion-value totals
  (0 without purchase tracking). Wire the GHL join to make these real.
- ❌ **Real ad thumbnails** — the Creatives grid uses gradient placeholders; Meta
  `creative.thumbnail_url` is available but not hotlinked yet (CSP/format).
- ❌ **"Best time of day"** card was dropped from the real Insights view (needs an
  hourly breakdown); demo only.
- ⚠️ No caching yet; each load hits Meta. Add KV caching (15 min, like the Rust
  app) if rate limits bite.
