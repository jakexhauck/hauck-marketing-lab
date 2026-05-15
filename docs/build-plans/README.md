# Build Plans — Hauck Marketing Lab

The single home for **every `.md` file that proposes building something** in this repo. Future handoff docs go here, full stop — not at the repo root, not in `docs/handoffs/`, not in ad-hoc folders.

## Conventions

- **One brief per file.** If a doc grows past ~500 lines or sprouts sub-builds, split it.
- **Numbered files are the agency-scale priority list** (`01-…` through `05-…`). Build order matches build priority. Lower number = higher leverage.
- **Unnumbered files are foundations or deferred plans.** They support or extend the numbered builds.
- **`_legacy-…` prefix** marks pre-existing implementation-detail docs that are kept for reference but have been superseded by a higher-level brief.
- **When a build ships, delete the doc.** Memory + git history are the lasting record. Stale build docs rot fast.
- **Cross-link liberally.** Each doc links its prerequisites.

## The priority list (build order)

| # | File | What it adds | Effort |
|---|---|---|---|
| 01 | [01-auto-populated-reports.md](01-auto-populated-reports.md) | Meta + Google Ads API pulls auto-fill weekly/monthly reports. Kills the biggest weekly time sink. | 2–3 days |
| 02 | [02-morning-ops-briefing.md](02-morning-ops-briefing.md) | One screen across all clients: replies needing response, CPL drift, stale approvals, slipped onboarding tasks. The dropped-balls detector. | 1–2 days |
| 03 | [03-closed-loop-outreach.md](03-closed-loop-outreach.md) | Actually send the outreach. Classify replies. Auto-draft responses. ~10× outbound throughput. | 3–5 days |
| 04 | [04-one-click-phase-1-cascade.md](04-one-click-phase-1-cascade.md) | "Mark client Won" fires all Phase 1 deliverables in parallel. Approve all in one modal. | 1 day |
| 05 | [05-niche-playbook-library.md](05-niche-playbook-library.md) | Per-niche playbooks (dental, gym, med-spa) pre-fill 80% of new-client Day 1 assets. | 2 days + content per niche |

**Why this order:** 01 buys the time, 02 prevents the dropped balls when that time fills with more clients, 03 is the volume play, 04 cleans up the onboarding friction, 05 turns the agency into a niche specialist instead of a generic shop.

## Foundations and adjacent plans

| File | Status | Purpose |
|---|---|---|
| [activity-log-and-memory-writeback.md](activity-log-and-memory-writeback.md) | Designed, ready to implement | Per-client `activity.log` + form-result writeback to `Memory.md`. Substrate that 01–04 all write into. **Ship before 02 and 03.** |
| [scheduled-agents.md](scheduled-agents.md) | Proposed | Cron-style overnight agent jobs (recap drafts, anomaly scans, reply pre-classification). Wraps the system once the substrate exists. |
| [split-view.md](split-view.md) | Plan only | Side-by-side / second-monitor pane support. Quality-of-life, not scaling lever. |
| [client-intake-email-automation.md](client-intake-email-automation.md) | Deferred | Wire intake form → GHL → welcome email. Independent of scaling builds; ship when Jake picks it up. |
| [client-onboarding-sequence.md](client-onboarding-sequence.md) | Proposed | New "Sequence" tab on Client Hub — guided 5-step form wizard (calendar → audience → copy → site → QA) with output-chained prefills. Complements doc 04 (parallel cascade); this is the serial new-client flow. |
| [custom-onboarding-calendar.md](custom-onboarding-calendar.md) | Code built, awaiting deploy | Custom-themed booking page → GHL calendar `NK53JD0np0dfOaRpmUWh`. Shares Apps Script with intake form. |
| [meta-ads-mcp.md](meta-ads-mcp.md) | Proposed | Wire official Meta Ads MCP for live campaign data (spend, CPM, CTR, CPA, ROAS, anomalies). Replaces static data-analyst input layer. |
| [freepik-image-video.md](freepik-image-video.md) | Proposed | Visuals workflow — Freepik Nano Banana stills + Seedance 5-sec animated clips. Closes the only real gap in the agency stack. |
| [static-ad-creatives.md](static-ad-creatives.md) | Proposed | HTML/CSS static ad generator (1080×1080 / 1350 / 1920) with six niche templates baked in. Sibling to WebDesignerPage. |
| [pitch-decks.md](pitch-decks.md) | Proposed | AI-assisted pitch deck builder for sales calls. |
| [BACKLOG.md](BACKLOG.md) | Living menu | All other deferred items — polish, QoL, architectural. Pick from here when between major builds. |

## Reference (legacy, superseded)

| File | Superseded by |
|---|---|
| [_legacy-01-close-the-data-loop.md](_legacy-01-close-the-data-loop.md) | [01-auto-populated-reports.md](01-auto-populated-reports.md). Keep for the field-level Meta API research. |
| [_legacy-02-outreach-send-and-reply-tracking.md](_legacy-02-outreach-send-and-reply-tracking.md) | [03-closed-loop-outreach.md](03-closed-loop-outreach.md). Keep for the prospect schema and sequence-file format detail. |

## Universal constraints

These come from `CLAUDE.md` and locked architectural decisions. Apply to every brief here.

- **No DB, no cloud, no auth.** Folder-as-database. New state lives as files inside `vault/`.
- **`claude -p` is the LLM engine.** No BYOK keys, no per-token charges.
- **Cross-machine sync is the private GitHub repo `jakexhauck/hauck-marketing-lab`.** App stays sync-agnostic.
- **No emojis in code or UI.** No italic serif on primary headlines. Sans-serif 500–600 weight for display type.
- **Gmail MCP is draft-only by design.** For programmatic send, doc 03 picks between Gmail API direct or Instantly/Smartlead.
- **Terse UI copy.** Functional labels only — no marketing prose.
