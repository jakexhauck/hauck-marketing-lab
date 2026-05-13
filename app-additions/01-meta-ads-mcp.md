# 1. Meta Ads MCP — Live Campaign Data

## What it is
Meta released an official MCP (Model Context Protocol) server on 2026-04-29 that exposes 29 tools
across 5 families (campaigns, catalog, accounts, datasets, insights). Once connected, Claude can
read and write Meta Ads data directly — no CSV exports, no Looker Studio.

URL: `https://mcp.facebook.com/ads`

## Why we want it
The app's current `data-analyst` skill works off CSV uploads. That means:
- Every report is a manual export.
- We can't run *live* pulls ("how did yesterday do?").
- Pre-pitch audits on a prospect's account require them to send us data.

Wiring the MCP server means the app can produce live reports for any account Jake's Meta user has
access to — including prospects' accounts during the sales process.

## Architecture fit
The app already uses `claude -p` for every AI call. Claude Code supports MCP servers via
`claude mcp add`. So this is mostly **configuration**, not new code.

The only app-side work is:
1. A one-time setup step (documented or scripted) to register the MCP server.
2. New form configs in `formConfigs.ts` for each report type.
3. A small UI surface to pick an ad account (the MCP returns a list; cache to a vault note).

## Implementation plan

### Step 1 — Register the MCP server (one-time)
Add to `app/src-tauri/src/claude.rs` (or wherever `claude -p` is invoked) a check-on-startup that
ensures the Meta MCP is registered for the user's Claude Code config:

```rust
// pseudo
fn ensure_meta_mcp() -> Result<()> {
    let listed = run("claude mcp list")?;
    if !listed.contains("meta-ads") {
        run("claude mcp add --transport http meta-ads https://mcp.facebook.com/ads")?;
    }
    Ok(())
}
```

First run will trigger Meta's OAuth popup in the user's browser. Subsequent runs are silent.

Optionally surface this as a button in the existing `TroubleshootingPage` ("Reconnect Meta Ads").

### Step 2 — Add a "Reports" form category (it already exists)
`formConfigs.ts` already has `category?: "phase" | "misc" | "reports"`. Use `"reports"` for the new
forms so they group correctly.

### Step 3 — Add eight new forms
Each is a thin wrapper around a verbatim `promptTemplate`. The class gives the prompts already —
just paste them in with `[ACCOUNT_ID]` and `[CLIENT_NAME]` as placeholders that get substituted
from the active client's `Profile.md` (use `prefillFromProfile`).

The eight:

1. **Daily Pulse** — yesterday's perf, HTML dashboard with status cards.
2. **Friday Client Report** — last 7 days, HTML one-pager.
3. **Cleanup Audit** — kill/keep/scale table for ad sets.
4. **Catalog Health Check** — `ads_catalog_get_diagnostics`, prioritized by revenue impact.
5. **Anomaly Slack Alert** — last 24h anomalies, formatted for Slack paste.
6. **Auction Edge Report** — `ads_insights_auction_ranking_benchmarks` on top 10 by spend.
7. **Pre-Pitch Account Audit** — opportunity score + industry benchmark, sales-ready 1-pager.
8. **Live Bloomberg Dashboard** — auto-refreshing HTML, large numbers, dark monospace.

Each form needs:
- `agentSlug: "stratos"` (data/analytics agent — or create a new `meta-ops` agent persona).
- Two fields minimum: client picker (drives Profile.md prefill) and ad account picker.
- `promptTemplate` with the verbatim prompt from the class (see section "8 Core Use Cases" of the
  source page).
- Output destination: `media-buying/data/<client>/reports/<date>-<report-type>.html`.

### Step 4 — Ad account picker
Add a backend command `meta_list_ad_accounts()` that runs `claude -p "List my Meta ad accounts as
JSON"` against the MCP. Cache the result to `vault/About/Meta Accounts.md` (refresh on demand).
Forms read from that cache rather than calling the MCP on every render.

Map ad-account-id → client slug in `Profile.md` so the picker can default to "the right account".

### Step 5 — The "combo" workflow (post-MVP)
Once 1–4 work, add a chained form:
1. Pull top-performing ad from Meta MCP (highest ROAS, ≥50 conversions, last 14 days).
2. Feed its headline/copy/image-description into the Static Ad Creative form (see plan #3).
3. Generate 10 variations with hypotheses.

This is the highest-leverage automation in the whole class. Save for after #3 ships.

## What's out of scope for v1
- **Write operations** (creating campaigns, ad sets, ads). The MCP supports them, but Jake should
  drive those from Ads Manager until the read flows are battle-tested.
- **Scheduled runs.** The class shows a dashboard that "refreshes every 5 min" via meta-tag — fine
  for one session, but real scheduling belongs to a future "automations" feature, not v1.

## Acceptance criteria
- `claude mcp list` shows `meta-ads` after first app launch.
- Selecting a client in the sidebar and running "Daily Pulse" produces a saved HTML file with live
  numbers from that client's ad account.
- "Pre-Pitch Account Audit" works on an account the user owns but isn't a current client (used for
  cold outreach).

## Effort estimate
- Setup + form scaffolding: half a day.
- Eight prompt templates + testing: half a day.
- Ad-account picker + caching: half a day.
- **Total: ~1.5 days.**

---

## Verbatim prompts

Drop each of these into a form's `promptTemplate`. Placeholders in `[BRACKETS]` map to
`promptPlaceholder` on form fields. Prefill from `Profile.md` where possible (account_id,
client_name, agency_name, industry).

### Prompt 1 — Daily Pulse
```
Use the meta-ads MCP to pull yesterday's performance for ad account [ACCOUNT_ID]. Group by campaign. For each row show: spend, CPM, CTR, CPA, conversions, vs the 7-day average. Then build me an HTML dashboard with red/yellow/green status cards. Add a summary at the top: biggest winner today, biggest concern, what to do. Use my agency colors: primary #FF6B00, bg #0A0A0A. Output a single self-contained HTML file.
```

### Prompt 2 — Friday Client Report
```
Pull the last 7 days of data for ad account [ACCOUNT_ID]. Generate an HTML one-pager I can send to my client [CLIENT_NAME] tonight. Include: spend vs target, leads (or purchases), CPL trend line, top 3 ads by ROAS with their thumbnails if available, anomalies flagged by ads_insights_anomaly_signal. Tone: confident, no jargon. Brand it with [AGENCY_NAME] header at the top. Output as single HTML.
```

### Prompt 3 — Andromeda Cleanup Audit
```
Pull the last 14 days of all ad sets in account [ACCOUNT_ID]. Flag: ad sets in extended Learning Phase, ones with fewer than 50 conversions/week, and any with CPA > 1.5× the account average. Output a kill/keep/scale table with one-line reasoning for each row. Sort by spend descending.
```

### Prompt 4 — Catalog Health Check
```
Run ads_catalog_get_diagnostics on catalog [CATALOG_ID]. Pull every error and warning. Build me a prioritized fix list grouped by severity, and estimate revenue-impact tier (high / medium / low) for each error type. Format as a checklist I can hand off to my client's developer.
```

### Prompt 5 — Anomaly Slack Alert
```
Run ads_insights_anomaly_signal on account [ACCOUNT_ID]. For anything flagged in the last 24h, write a one-line plain-English explanation + a one-line suggested action. Format the whole thing as a Slack-pasteable summary I can drop in #client-[NAME] right now.
```

### Prompt 6 — Auction Edge Report
```
Pull ads_insights_auction_ranking_benchmarks for the top 10 ads by spend in account [ACCOUNT_ID]. For each, show our quality / engagement / conversion ranking vs the auction. Identify which ads are losing the auction and explain what's likely dragging us — quality, relevance, or bid strategy. Output as a ranked table.
```

### Prompt 7 — Pre-Pitch Account Audit
```
I'm pitching [BUSINESS_NAME] tomorrow. Use the meta-ads MCP to query the ad opportunity score for their account if I have access, and benchmark them against ads_insights_industry_benchmark for [INDUSTRY]. If I don't have account access, query their public Meta Ad Library footprint instead. Output a "state of their advertising" 1-pager I can use to anchor the pitch — what's working, what's broken, where I'd start.
```

### Prompt 8 — Bloomberg-Style Live Dashboard
```
Build me a self-refreshing HTML dashboard for ad account [ACCOUNT_ID]. Top row = today's spend / leads / ROAS as huge numbers with up/down arrows vs yesterday. Middle = bar chart of last 7 days revenue. Bottom-left = top 5 ads with thumbnails + CPA. Bottom-right = anomaly feed (latest first). Use my agency colors [HEX_PRIMARY] / [HEX_BG]. Make it look like a Bloomberg terminal — dense, monospace, dark. Refresh every 5 minutes via a meta-tag refresh. Single self-contained HTML file.
```

### Combo Prompt — Top Performer → 10 Variations
This is the chained form referenced in Step 5. Pulls live data via MCP, then feeds it into the
ad-creative generator from plan #3.
```
Use the meta-ads MCP to find the top-performing ad in account [ACCOUNT_ID] over the last 14 days (highest ROAS, minimum 50 conversions). Pull its headline, primary text, image description, and key performance stats. Then design me 10 static ad variations in HTML that keep the SAME core angle and offer, but change ONE variable per ad: - 3 with new headlines (same hook, different framing) - 3 with new visual layouts (split, stacked, full-bleed) - 2 with new CTAs - 2 with new social proof angles (review count, before/after, named testimonial) Style: match my client's brand — [paste brand colors / fonts / vibe OR drag in their logo and brand kit]. Format: 1080x1080. Each variation as a separate HTML artifact, ready to screenshot. Output: also list which variable changed in each one and your hypothesis for why it might outperform the winner.
```
