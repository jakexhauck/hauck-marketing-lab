# 1a. Swapping the Mock Ads Manager for the real Meta Ads MCP

> Companion to `01-meta-ads-mcp.md`. That plan covers the 8 report forms.
> This one covers the **visual Ads Manager surface** (`AdsManagerPage`)
> shipped 2026-05-15 with mock data. When Jake has a live ad account, this
> doc describes the swap.

## Where the mock lives

- **Data shape**: `app/src/lib/mockMetaAds.ts` — typed model that mirrors
  Meta Marketing API fields (campaigns → ad sets → ads, plus daily series).
- **Component**: `app/src/components/MainDashboard/AdsManagerPage.tsx` —
  hybrid layout (KPI tiles + filterable campaign table + detail rail).
- **Routes**:
  - Top-level: `AppSidebar` "Ads Manager" (workspace tab `"ads"`) renders
    `<AdsManagerPage mode="global" />` with client-filter pills.
  - Per-client: `ClientDashboard` "Ads" tab (section `"ads"`) renders
    `<AdsManagerPage mode="client" />` scoped to the active client.

The "MOCK DATA" amber pill at the top of the page is the visual signal that
the data is synthetic. Removing that pill is part of the swap.

## The actual swap (when the account is live)

### Step 1 — Register the MCP (one-time)

Run once on a machine that has `claude` CLI on PATH:

```
claude mcp add --transport http meta-ads https://mcp.facebook.com/ads
```

First invocation triggers the Meta OAuth popup in the browser. Successful
auth caches the token in the user's Claude Code config so all subsequent
`claude -p` calls inherit MCP access. Verify with:

```
claude mcp list
```

You should see `meta-ads` listed. The Tauri app does not need to manage
OAuth itself — it piggybacks on the CLI's auth.

### Step 2 — Add a Tauri command that fetches insights via `claude -p`

In `app/src-tauri/src/claude.rs` (or a new `meta_ads.rs`), add a command:

```rust
#[tauri::command]
pub async fn meta_ads_insights(
    account_id: String,
    window_days: u8,
) -> Result<MetaInsightsJson, String> {
    // Build a prompt that asks the meta-ads MCP for a structured JSON
    // payload matching the MetaAdsAccount shape in mockMetaAds.ts.
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

Expose it through `app/src/lib/tauri.ts` (`api.metaAdsInsights`).

### Step 3 — Wire the loader switch in `AdsManagerPage`

Replace the `useMemo` block that calls `getMockAdsAccount(...)` with a
`useEffect` + `useState` that calls `api.metaAdsInsights(...)`. Keep the
mock path behind a feature flag during rollout:

```ts
const USE_LIVE_META = import.meta.env.VITE_USE_LIVE_META === "1";

// ...
const [accounts, setAccounts] = useState<MetaAdsAccount[]>([]);

useEffect(() => {
  let cancelled = false;
  (async () => {
    if (USE_LIVE_META && effectiveSlug) {
      const accountId = await resolveAccountIdForClient(effectiveSlug);
      const live = await api.metaAdsInsights(accountId, windowDays);
      if (!cancelled) setAccounts([live]);
    } else {
      // existing mock path
      setAccounts(buildMockAccounts());
    }
  })();
  return () => { cancelled = true; };
}, [effectiveSlug, windowDays]);
```

### Step 4 — Map ad-account-id → client slug

Add an `ad_account_id` field to each client's `vault/Clients/<Name>/Profile.md`
frontmatter, and a settings UI to set it. `resolveAccountIdForClient(slug)`
reads from that profile note.

For the global "All clients" mode, fan out N parallel `meta_ads_insights`
calls (one per client with an `ad_account_id`) and aggregate.

### Step 5 — Drop the MOCK badge

In `AdsManagerPage`, gate the badge:

```tsx
{accounts[0]?.source === "mock" && <span className="hml-mock-badge">...</span>}
```

The data shape (`MetaAdsAccount.source: "mock" | "connected"`) is already
in place. The real fetch should set `source: "connected"`.

## What stays the same

- The component's props (`mode`, `clients`, `activeClientSlug`).
- The data type contracts in `mockMetaAds.ts` (campaigns/ad sets/ads/daily).
- All styling and the hybrid layout.
- The navigation wiring (workspace tab + per-client section).

## Acceptance criteria for the swap

- `claude mcp list` shows `meta-ads` on the local machine.
- Picking a client with a configured `ad_account_id` shows live numbers.
- The MOCK badge disappears when `source === "connected"`.
- The global view aggregates correctly across multiple live accounts.
- Refresh button re-runs the insights query (currently a no-op stub).

## Open questions to revisit at swap time

- **Caching**: Insights pulls can be slow. Cache responses to
  `vault/Clients/<Name>/.ads-cache.json` with a 5-minute TTL?
- **Write operations**: Per `01-meta-ads-mcp.md` § "What's out of scope" —
  keep this surface read-only. Pausing campaigns from inside the app should
  wait until the read flows are battle-tested.
- **Rate limits**: Meta's MCP probably inherits Marketing API rate limits.
  The global view fanning out per-client may hit limits with 10+ clients.
