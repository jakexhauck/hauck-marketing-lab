# 01 — Auto-populated weekly + monthly reports

> **Status:** Proposed. Build first.
> **Effort:** 2–3 days for read-only Meta. +1 day for Google Ads. +half day for the form auto-fill wiring.
> **Why first:** The single largest hourly time sink at the current client count. Buys back the bandwidth that funds every other build.
> **Depends on:** [activity-log-and-memory-writeback.md](activity-log-and-memory-writeback.md) (so pulls and anomalies log somewhere).
> **Supersedes the implementation detail in:** [_legacy-01-close-the-data-loop.md](_legacy-01-close-the-data-loop.md) — read for prior architectural decisions and field-level Meta API notes.

---

## Why this matters

Every Zenith report (`weekly-report`, `monthly-report` in `app/src/lib/formConfigs.ts`) is currently a 30-field data-entry exercise. Numbers come from whatever Jake pastes in. At 3 clients this is annoying. At 10 it is a full day per week. At 15 it stops happening.

The forms are already well-shaped: the `promptTemplate` mode renders a fixed report layout from `[TOKEN]` substitutions. The only thing missing is the data path that fills those tokens automatically.

## What we have today

- `weekly-report` form: 11 quantitative fields (TOTAL SPEND, TOTAL LEADS, CPL, BEST AD NAME, BEST AD CPL, PAUSED ADS, SCALED AD, NEW CREATIVES, plus qualitative TRENDS / TOP AD WHY / NEXT WEEK PLAN).
- `monthly-report` form: 23 fields, most of which are pure Meta Insights data (spend, leads, CPL, revenue, ROAS, MoM deltas).
- `app/src-tauri/` already has the pattern for spawning external processes (`lead_scraper.rs`, `web_designer.rs`) — same pattern works for API pulls.
- Active client's vault folder (`vault/Clients/<name>/`) is the natural place for cached API responses + tokens.

## What "done" looks like

1. **Per-client credential setup, one time:** Settings → Client → "Connect Meta Ads" launches OAuth (Facebook Login) and stores the long-lived token + `ad_account_id` in `vault/Clients/<name>/integrations.json` (gitignored). Same shape for Google Ads.
2. **Form fetch button:** In the weekly/monthly report form, a `▸ Pull this week's numbers` action above the quantitative fields. Click → fetch from Meta Insights API → populate every `[TOKEN]` field that has a known API source. Qualitative fields stay blank for Jake to fill.
3. **Last-pulled badge:** Each quantitative field shows `auto · pulled 2m ago` once filled. Jake can override any value by typing — overrides win.
4. **Generate runs as before.** No template change. The same `promptTemplate` ships verbatim with substituted values.
5. **Pull is idempotent.** Running it again refreshes; never duplicates report runs.

## Build steps

1. **Token + account storage.**
   - New `vault/Clients/<name>/integrations.json` with shape `{ meta: { access_token, ad_account_id, connected_at }, google_ads: { ... } }`.
   - Add `integrations.json` to `.gitignore`.
   - Tauri commands: `read_integrations(client_slug)`, `write_integrations(client_slug, payload)`.

2. **Meta Insights pull (Rust).**
   - New module `app/src-tauri/src/meta_ads.rs` with a `fetch_insights(account_id, since, until)` command.
   - Read token from `integrations.json` for the active client.
   - Returns a typed struct: `{ spend, leads, cpl, revenue_estimated, roas, top_ads: [{name, cpl, spend, leads}], paused_ads, scaled_ads, new_creatives }`.
   - Use the official Meta Marketing API v18+ endpoint. Field list documented inline.

3. **Form wiring.**
   - In `GenericFormGenerator.tsx`, when the active form is `weekly-report` or `monthly-report`, render a `Pull numbers` button.
   - On click: call the Meta + (later) Google fetcher, map response fields → form fields by `key`, `setValues((prev) => ({ ...prev, ...patch }))`.
   - Show `auto · pulled <relative time>` next to each field that was set by the pull.

4. **Top-ad selection logic.**
   - "Best performing ad" = ad with lowest CPL above a minimum spend threshold (default $50 over the period). Configurable in `integrations.json` per client.

5. **Activity log entry.**
   - On every pull, write to `vault/Clients/<name>/activity.log` (per the activity-log doc) — line: `2026-MM-DD HH:MM · meta_pull · spend=$X leads=Y cpl=$Z`.

6. **Failure modes.**
   - Token expired → form shows red banner "Meta token expired — reconnect in Settings."
   - No spend in period → all fields populate with zeros, qualitative fields prompt Jake to acknowledge the dry week.

7. **Google Ads (phase 2).**
   - Same pattern. Google Ads API is harder to OAuth — needs a developer token. Documented as a follow-up.

## Open decisions

- **Do we attempt revenue estimation, or require manual entry?** Meta does not return revenue. Two options: (a) Lead-to-close × AOV from `vault/Clients/<name>/Profile.md`, with the form showing it as "estimated"; (b) leave revenue manual. Default to (a) unless Jake says otherwise.
- **Where does the OAuth flow run?** Likely in a child Tauri window pointed at Facebook's OAuth URL with a localhost redirect. Confirm before coding.
- **Cache window.** Meta Insights is slow. Cache pulls for 15min by default so a re-click doesn't re-hit the API. Configurable.

## Out of scope (do not let this sprawl)

- Writing back to ad accounts (pausing ads, changing budgets). Read-only only.
- Per-ad creative analysis (different doc).
- TikTok / LinkedIn / X ads. Meta + Google only.
- Anomaly detection (lives in `scheduled-agents.md`).

## Effort + leverage

- 2–3 days first ship.
- Saves ~1 hour per client per week the moment it's live.
- At 10 clients: ~40 hrs/month recovered.
