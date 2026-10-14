# Client Dashboard Fix Plan: Master Index

The June 2026 audit of `client-dashboard/` produced roughly 80 findings. They are being fixed in five parts, in this order. Each part has its own runbook folder containing the implementation spec (what Claude changes in code) and your manual-actions checklist (what Jake does by hand: dashboards, GHL config, and verification).

Scope reminder (as written, June 2026): everything targeted the **test account only**. No live client was being configured yet. The goal was a fully functional, fully generic app that could be stamped out for any client later; client onboarding gets its own runbook once the app is proven.

> **Read this before following any step below.** The "test account" these runbooks
> point at is GHL location `r0WfsA12qpBv7M185V3v`, and since **2026-08-09** that
> location is **Made Better Landscaping Co's own sub-account**. It holds a real
> client's data. Nothing in it is safe to experiment with, delete, or use as a
> scratch pad. Every instruction below that says "in the test account" now means
> "in a live client's account", so treat it accordingly.

Before doing any manual step, skim [SOFTWARE-GUIDE.md](SOFTWARE-GUIDE.md): it holds the exact click paths (Recipes A through F) for Supabase, Cloudflare, and GoHighLevel that every checklist references. UI labels verified against official docs, June 2026.

| Part | Folder | Theme | Code status | Your actions status |
|---|---|---|---|---|
| 4 | [part-4-pwa-offline/](part-4-pwa-offline/) | PWA lifecycle: service worker updates, offline auth, cache hygiene, 401 handling | ☑ Done (69eeb4c) | ☐ |
| 5 | [part-5-value-adds-ux/](part-5-value-adds-ux/) | Real data clients care about (UTM attribution, tags) plus the full UX polish list | ☑ Done (awaiting commit) | ☐ |

**Done and removed (2026-06-10):** Part 1 (security and tenancy: webhook auth + location routing, tenant slug scoping, session/login hardening, dev backdoors out of prod builds, migrations through 0006) and Part 2 (GHL write-path correctness: won/contact notes, tasks API conformance, message type normalization, thread + conversations pagination, rep lead filtering, safe retries). Both were implemented, deployed, verified live against the test account, then re-reviewed adversarially with four hardening follow-ups (commit 8cfb879: assignedTo preserved through task edits, PUT/DELETE retries, conversations list type guard, thread cursor dedupe). Their runbook folders were removed; the record of every Part 1 code change lives in git history under `docs/runbooks/part-1-security/05-code-changes-reference.md`.

**Done and removed (2026-06-11):** Part 3 (stage mapping retirement). Deleted `stageMap.ts` keyword heuristics and the 8-bucket app-stage vocabulary; leads now carry real pipeline/stage ids with display names resolved against `/api/pipelines` (the singular `/api/pipeline` endpoint was removed). Won/Lost are opportunity-status-driven; LeadDetail outcomes are Won / Lost / Move Stage via a shared stage picker; stage moves invalidate every leads cache. Today re-keyed on status + stage position ("Booked Today" became "Won Today"), stats "Booked" became "Progressed"/"New", and the Dashboard scopes to the selected pipeline. Implemented in commit 4794ed5, deployed, and verified live by Jake across all five test pipelines on 2026-06-11, including the motivating regression (Won no longer jumps leads into "Lead In No Appointment Booked").

## How each part runs

1. Jake says "start Part N".
2. Claude implements the spec in that part's `01-implementation-spec.md`, runs typecheck and build, and reports what changed (including anything extra found along the way).
3. Jake reviews the report, then works down `02-manual-actions.md` for that part: deploy, configure, verify.
4. Both boxes ticked in the table above; move to the next part.

## Standing rules

- Parts run in order. Part 4 changes caching that Part 5's UX work assumes.
- All migrations are idempotent and copied to the clipboard with `pbcopy`, never from chat (see part-1 ground rules).
- No em dashes in any UI text, ever.
- If a verification step fails, stop, paste the exact error or describe the screen, and do not continue to the next part.
