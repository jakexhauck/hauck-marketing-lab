# Meta Ads, live data across the app

> Status: Proposed. Highest priority infrastructure build.
> Effort: ~3 days total (MCP setup + 8 report forms + Ads Manager swap + weekly/monthly auto-fill).
> Why first: Powers live reporting, the Ads Manager visualization, and auto-filled weekly/monthly client reports. Three downstream features collapse into one data path.
> Depends on: nothing.

## What this build replaces

Three earlier docs (now merged): the original Meta MCP proposal, the Ads Manager mock-to-live swap, and the auto-populated-reports plan. They all share the same data plumbing.

## Architecture: MCP is the single path

Meta released an official MCP server at `https://mcp.facebook.com/ads` on 2026-04-29 (29 tools across campaigns, catalog, accounts, datasets, insights). Claude Code reads and writes Meta Ads data directly through it. No CSV exports, no per-client OAuth flows, no custom HTTP client.

The earlier auto-reports doc assumed per-client OAuth + direct Marketing API. That predated the MCP. **Use MCP for everything.** Per-account scoping is handled by Meta's auth (Jake's user sees the accounts he has access to, including prospects' accounts during sales).

## Implementation

### 1. Register the MCP (one-time)

```
claude mcp add --transport http meta-ads https://mcp.facebook.com/ads
```

First call triggers Meta OAuth in the browser. Token caches in the Claude Code config; subsequent `claude -p` calls inherit access. Verify with `claude mcp list`.

Optionally surface a "Reconnect Meta Ads" button in TroubleshootingPage.

App-side check-on-startup (`app/src-tauri/src/claude.rs`) ensures the MCP is registered:

```rust
fn ensure_meta_mcp() -> Result<()> {
    let listed = run("claude mcp list")?;
    if !listed.contains("meta-ads") {
        run("claude mcp add --transport http meta-ads https://mcp.facebook.com/ads")?;
    }
    Ok(())
}
```

### 2. Ad-account picker, cached to vault

Backend command `meta_list_ad_accounts()` runs `claude -p "List my Meta ad accounts as JSON"` against the MCP. Cache to `vault/About/Meta Accounts.md`. Forms read from cache, refresh on demand.

Per-client mapping: add an `ad_account_id` field to each client's `vault/Clients/<Name>/Profile.md` frontmatter. Picker defaults to "the right account" for the active client.

### 3. Ads Manager page, swap from mock

Where the mock lives:

- Data shape: `app/src/lib/mockMetaAds.ts` (typed model mirroring Meta Marketing API: campaigns → ad sets → ads, plus daily series).
- Component: `app/src/components/MainDashboard/AdsManagerPage.tsx` (hybrid layout: KPI tiles + filterable campaign table + detail rail).
- Routes: top-level `AppSidebar` "Ads Manager" tab renders `<AdsManagerPage mode="global" />` with client-filter pills; per-client `ClientDashboard` "Ads" tab renders `<AdsManagerPage mode="client" />`.
- "MOCK DATA" amber pill at the top of the page is the visual signal that the data is synthetic.

Backend (`app/src-tauri/src/meta_ads.rs`):

```rust
#[tauri::command]
pub async fn meta_ads_insights(
    account_id: String,
    window_days: u8,
) -> Result<MetaInsightsJson, String> {
    let prompt = format!(
        "Use the meta-ads MCP. Pull ad_account {} for the last {} days.\
         Group by campaign, then ad set, then ad. Return ONE JSON object\
         matching this TypeScript type EXACTLY (no prose, no markdown fences):\n\
         {{ accountId, accountName, currency, totals: {{spend, results, cpr,\
            roas, revenue, ctr, cpm, frequency}}, daily: [{{date, spend,\
            results, revenue}}], campaigns: [{{id, name, objective, status,\
            budgetDaily, spend, results, cpr, roas, ctr, cpm, frequency,\
            adSets: [...]}}] }}",
        account_id, window_days
    );
    let out = run_claude_p(&prompt).await?;
    serde_json::from_str(&out).map_err(|e| e.to_string())
}
```

Expose through `app/src/lib/tauri.ts` (`api.metaAdsInsights`).

Frontend loader switch in `AdsManagerPage`:

```ts
const USE_LIVE_META = import.meta.env.VITE_USE_LIVE_META === "1";

const [accounts, setAccounts] = useState<MetaAdsAccount[]>([]);

useEffect(() => {
  let cancelled = false;
  (async () => {
    if (USE_LIVE_META && effectiveSlug) {
      const accountId = await resolveAccountIdForClient(effectiveSlug);
      const live = await api.metaAdsInsights(accountId, windowDays);
      if (!cancelled) setAccounts([live]);
    } else {
      setAccounts(buildMockAccounts());
    }
  })();
  return () => { cancelled = true; };
}, [effectiveSlug, windowDays]);
```

The data shape (`MetaAdsAccount.source: "mock" | "connected"`) is already in place. Gate the MOCK badge on `source === "mock"`. For global "All clients" mode, fan out N parallel `meta_ads_insights` calls (one per client with an `ad_account_id`) and aggregate.

What stays the same:
- Component props (`mode`, `clients`, `activeClientSlug`).
- Data type contracts in `mockMetaAds.ts`.
- All styling, hybrid layout, navigation wiring.

### 4. Eight live report forms

Each is a thin wrapper around a verbatim `promptTemplate` in `formConfigs.ts` with `category: "reports"`. Fields: client picker (drives Profile.md prefill) and ad account picker. Output: `media-buying/data/<client>/reports/<date>-<report-type>.html`.

Agent: `stratos` or a new `meta-ops` persona.

The eight prompts are at the bottom of this doc.

### 5. Auto-fill weekly + monthly Zenith reports

Two existing forms get a "Pull this week's numbers" button:

- `weekly-report`: 11 quantitative fields (TOTAL SPEND, TOTAL LEADS, CPL, BEST AD NAME, BEST AD CPL, PAUSED ADS, SCALED AD, NEW CREATIVES) plus qualitative TRENDS / TOP AD WHY / NEXT WEEK PLAN.
- `monthly-report`: 23 fields, mostly raw Meta Insights data.

Wiring:

```ts
// In GenericFormGenerator.tsx, when active form is weekly-report or monthly-report:
<button onClick={async () => {
  const data = await api.metaAdsInsights(accountId, windowDays);
  const patch = mapInsightsToFormFields(data);
  setValues(prev => ({ ...prev, ...patch }));
}}>Pull this week's numbers</button>
```

Each auto-filled field shows `auto, pulled 2m ago`. Jake's manual edits win.

- **Top-ad logic:** lowest CPL above a minimum spend threshold (default $50 over the period, per-client override in `Profile.md`).
- **Revenue estimation:** Meta does not return revenue. Default: estimate via `lead_to_close × AOV` from `Profile.md`, show as "estimated". Override manually.
- **Cache:** insights pulls are slow. 15-min default per account, configurable.
- **Failure modes:** token expired (red banner "Meta token expired, reconnect in Settings"); no spend in period (all fields populate with zeros, qualitative fields prompt Jake to acknowledge the dry week).

### 6. Activity log entries

Every MCP pull writes to `vault/ops/activity.jsonl` (see Activity + Briefing doc):

```
2026-MM-DD HH:MM · meta_pull · spend=$X leads=Y cpl=$Z
```

### 7. Combo workflow (post-MVP)

Once 1, 4, and 5 work, add a chained form:

1. Pull top-performing ad from MCP (highest ROAS, ≥50 conversions, last 14 days).
2. Feed headline/copy/image-description into the Static Ad Creative form (see Ad Creatives doc).
3. Generate 10 variations with hypotheses.

The verbatim combo prompt is at the bottom.

## Open questions to revisit at swap time

- **Caching.** Insights pulls can be slow. Cache responses to `vault/Clients/<Name>/.ads-cache.json` with a 5-minute TTL?
- **Write operations.** Keep read-only. Pausing campaigns from inside the app waits until reads are battle-tested.
- **Rate limits.** Meta's MCP probably inherits Marketing API rate limits. The global view fanning out per-client may hit limits with 10+ clients.

## Out of scope

- Write operations (creating campaigns, ad sets, ads). MCP supports them; keep this surface read-only until reads are battle-tested.
- Scheduled runs (lives in the Outreach + Jobs doc).
- TikTok / LinkedIn / X. Google Ads is a phase-2 add (same pattern, different MCP/API).

## Acceptance criteria

- `claude mcp list` shows `meta-ads` after first app launch.
- Selecting a client with `ad_account_id` configured runs "Daily Pulse" against that account.
- AdsManagerPage MOCK badge disappears under `VITE_USE_LIVE_META=1`.
- Weekly report's "Pull numbers" populates the 11 quantitative fields.
- "Pre-Pitch Account Audit" works on a prospect's account (used for cold outreach).
- Global view aggregates correctly across multiple live accounts.
- Refresh button re-runs the insights query.

## Effort estimate

- MCP setup + ad-account picker + caching: half a day.
- Eight report forms (form configs + prompts + testing): 1 day.
- Ads Manager swap: half a day.
- Weekly/monthly auto-fill: half a day.
- Activity log entries: ~1 hour.
- **Total: ~3 days.**

---

## Verbatim prompts: the eight live reports

Drop each into a form's `promptTemplate`. Placeholders in `[BRACKETS]` map to `promptPlaceholder` on form fields. Prefill from `Profile.md` where possible (account_id, client_name, agency_name, industry).

### Prompt 1, Daily Pulse
```
Use the meta-ads MCP to pull yesterday's performance for ad account [ACCOUNT_ID]. Group by campaign. For each row show: spend, CPM, CTR, CPA, conversions, vs the 7-day average. Then build me an HTML dashboard with red/yellow/green status cards. Add a summary at the top: biggest winner today, biggest concern, what to do. Use my agency colors: primary #FF6B00, bg #0A0A0A. Output a single self-contained HTML file.
```

### Prompt 2, Friday Client Report
```
Pull the last 7 days of data for ad account [ACCOUNT_ID]. Generate an HTML one-pager I can send to my client [CLIENT_NAME] tonight. Include: spend vs target, leads (or purchases), CPL trend line, top 3 ads by ROAS with their thumbnails if available, anomalies flagged by ads_insights_anomaly_signal. Tone: confident, no jargon. Brand it with [AGENCY_NAME] header at the top. Output as single HTML.
```

### Prompt 3, Andromeda Cleanup Audit
```
Pull the last 14 days of all ad sets in account [ACCOUNT_ID]. Flag: ad sets in extended Learning Phase, ones with fewer than 50 conversions/week, and any with CPA > 1.5× the account average. Output a kill/keep/scale table with one-line reasoning for each row. Sort by spend descending.
```

### Prompt 4, Catalog Health Check
```
Run ads_catalog_get_diagnostics on catalog [CATALOG_ID]. Pull every error and warning. Build me a prioritized fix list grouped by severity, and estimate revenue-impact tier (high / medium / low) for each error type. Format as a checklist I can hand off to my client's developer.
```

### Prompt 5, Anomaly Slack Alert
```
Run ads_insights_anomaly_signal on account [ACCOUNT_ID]. For anything flagged in the last 24h, write a one-line plain-English explanation + a one-line suggested action. Format the whole thing as a Slack-pasteable summary I can drop in #client-[NAME] right now.
```

### Prompt 6, Auction Edge Report
```
Pull ads_insights_auction_ranking_benchmarks for the top 10 ads by spend in account [ACCOUNT_ID]. For each, show our quality / engagement / conversion ranking vs the auction. Identify which ads are losing the auction and explain what's likely dragging us, quality, relevance, or bid strategy. Output as a ranked table.
```

### Prompt 7, Pre-Pitch Account Audit
```
I'm pitching [BUSINESS_NAME] tomorrow. Use the meta-ads MCP to query the ad opportunity score for their account if I have access, and benchmark them against ads_insights_industry_benchmark for [INDUSTRY]. If I don't have account access, query their public Meta Ad Library footprint instead. Output a "state of their advertising" 1-pager I can use to anchor the pitch, what's working, what's broken, where I'd start.
```

### Prompt 8, Bloomberg-Style Live Dashboard
```
Build me a self-refreshing HTML dashboard for ad account [ACCOUNT_ID]. Top row = today's spend / leads / ROAS as huge numbers with up/down arrows vs yesterday. Middle = bar chart of last 7 days revenue. Bottom-left = top 5 ads with thumbnails + CPA. Bottom-right = anomaly feed (latest first). Use my agency colors [HEX_PRIMARY] / [HEX_BG]. Make it look like a Bloomberg terminal, dense, monospace, dark. Refresh every 5 minutes via a meta-tag refresh. Single self-contained HTML file.
```

### Combo Prompt, Top Performer to 10 Variations
This is the chained form referenced in step 7. Pulls live data via MCP, then feeds it into the ad-creative generator from the Ad Creatives doc.
```
Use the meta-ads MCP to find the top-performing ad in account [ACCOUNT_ID] over the last 14 days (highest ROAS, minimum 50 conversions). Pull its headline, primary text, image description, and key performance stats. Then design me 10 static ad variations in HTML that keep the SAME core angle and offer, but change ONE variable per ad: - 3 with new headlines (same hook, different framing) - 3 with new visual layouts (split, stacked, full-bleed) - 2 with new CTAs - 2 with new social proof angles (review count, before/after, named testimonial) Style: match my client's brand, [paste brand colors / fonts / vibe OR drag in their logo and brand kit]. Format: 1080x1080. Each variation as a separate HTML artifact, ready to screenshot. Output: also list which variable changed in each one and your hypothesis for why it might outperform the winner.
```
