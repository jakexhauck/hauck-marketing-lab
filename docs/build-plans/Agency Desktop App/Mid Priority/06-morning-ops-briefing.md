# 02 — Morning ops briefing

> **Status:** Proposed. Build second.
> **Effort:** 1–2 days for the read-only dashboard. +1 day if we wire push notifications.
> **Why this matters:** At 3 clients Jake remembers everything. At 10 he doesn't. This is the dropped-balls detector.
> **Depends on:** [activity-log-and-memory-writeback.md](activity-log-and-memory-writeback.md) (sources rows), [01-auto-populated-reports.md](01-auto-populated-reports.md) (sources the live CPL numbers).
> **Adjacent to:** [scheduled-agents.md](scheduled-agents.md) — the briefing can either be pulled live on app open, or pre-built by a scheduled job at 7am. Pick one; recommendation below.

---

## Why this matters

Most agencies don't fail at scale because their work gets worse. They fail because attention fragments and individual balls drop silently — a creative awaiting approval for 5 days, a CPL that drifted 30% over target, an outreach reply nobody answered.

The Hauck Marketing OS already has every input it needs to surface these. It does not currently aggregate them.

## What we have today

- `OpsTrackers.tsx` — per-client trackers, but no cross-client summary view.
- `ClientDashboard.tsx` — per-client overview, requires clicking into each client.
- `vault/Clients/<name>/Memory.md` and (after activity log ships) `activity.log`.
- `onboardingPlan.ts` — knows phase + day numbers per task per client.
- After 01 ships: live CPL per client cached in `integrations.json` or `activity.log`.

## What "done" looks like

A single page — the new app landing surface or a top-level "Today" tab — that shows, across **all active clients**:

1. **Inbox needing reply.** Outreach replies + client emails awaiting response > 24h. Source: the reply-classifier from the outreach build (post-03 ship), or Gmail MCP search until then.
2. **CPL drift alerts.** Any client whose 7-day-rolling CPL is >20% above target (from `Profile.md` benchmarks). One row per breach: client, current CPL, target, delta, since when.
3. **Creative awaiting approval >48h.** Any saved-output flagged for client review without a "approved" entry in the activity log.
4. **Onboarding slippage.** Any task in `onboardingPlan.ts` past its phase-day for a client without a checked-off date.
5. **Yesterday's wins.** Counter line: `12 leads · 3 form runs · 1 creative shipped · 18 outreach sent · 2 replies`.

Each row is a deep-link into the relevant client surface.

## Build steps

1. **Aggregator module.**
   - New `app/src/lib/briefing.ts` — pure function that takes (clients, activity log, integrations.json, onboarding plan) and returns a typed `BriefingPayload`.
   - No I/O inside the function — feed it data, get rows out. Easier to test.

2. **Data sources.**
   - `vault/Clients/*/Memory.md` — read existing.
   - `vault/Clients/*/activity.log` — read after activity-log doc ships.
   - `vault/Clients/*/Profile.md` — for CPL target + AOV.
   - `vault/Clients/*/integrations.json` — for last-pulled CPL.
   - Gmail MCP via `claude -p` — for inbox-needing-reply counts. One subprocess, returns JSON.

3. **The page.**
   - New `app/src/components/MainDashboard/MorningBriefing.tsx`.
   - Five collapsed sections, each with a count badge. Click expands the rows.
   - Empty state per section: `▸ all clear`.
   - Refresh button + auto-refresh on focus.

4. **Wiring.**
   - Add `Today` as the first sidebar item under Workspace.
   - Optional: make it the default landing surface on app open (currently `Main Dashboard`). Configurable.

5. **Push (phase 2).**
   - Tauri's `notification` plugin: fire a system notification when a new red-alert row appears since last open.
   - Don't fire on every drift — only state transitions (green→red).

## Recommendation: pull live, don't pre-build

The scheduled-agents path would have a 7am job that pre-computes the briefing into `vault/briefing/YYYY-MM-DD.md`. Pulling live on app open is simpler, never stale, and only marginally slower (most data is local files). Go live-pull for v1; revisit if it gets slow at 15+ clients.

## Open decisions

- **CPL drift threshold.** Default 20% above target. Per-client override via `Profile.md`. Confirm.
- **Approval staleness.** Default 48h. Confirm — could be 72h or per-niche.
- **Replace MainDashboard or sit beside it?** Recommend sit-beside as `Today`, leave MainDashboard for the OS feel. Confirm.

## Out of scope

- Notifications via SMS / email / Slack. System notifications only.
- Action-taking from the briefing (e.g. "pause this ad" button). Read-only.
- Historical briefings / trend view. Today only.

## Effort + leverage

- 1–2 days.
- The kind of thing that matters more at 8 clients than at 3 — build it now so it's there when scaling.
