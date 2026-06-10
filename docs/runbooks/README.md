# Client Dashboard Fix Plan: Master Index

The June 2026 audit of `client-dashboard/` produced roughly 80 findings. They are being fixed in five parts, in this order. Each part has its own runbook folder containing the implementation spec (what Claude changes in code) and your manual-actions checklist (what Jake does by hand: dashboards, GHL config, and verification).

Scope reminder: everything targets the **test account only**. No live client is being configured yet. The goal is a fully functional, fully generic app that can be stamped out for any client later; client onboarding gets its own runbook once the app is proven.

Before doing any manual step, skim [SOFTWARE-GUIDE.md](SOFTWARE-GUIDE.md): it holds the exact click paths (Recipes A through F) for Supabase, Cloudflare, and GoHighLevel that every checklist references. UI labels verified against official docs, June 2026.

| Part | Folder | Theme | Code status | Your actions status |
|---|---|---|---|---|
| 1 | [part-1-security/](part-1-security/) | Security and tenancy: webhook auth + routing, tenant scoping, session/login hardening, dev backdoors out of prod, DB integrity | **Done 2026-06-10** | ☐ In progress |
| 2 | [part-2-ghl-write-paths/](part-2-ghl-write-paths/) | GHL write-path correctness: notes, tasks, messages, pagination, rep lead filtering | ☐ Not started | ☐ |
| 3 | [part-3-stage-mapping/](part-3-stage-mapping/) | Retire keyword stage guessing; raw pipeline stages everywhere | ☐ Not started | ☐ |
| 4 | [part-4-pwa-offline/](part-4-pwa-offline/) | PWA lifecycle: service worker updates, offline auth, cache hygiene, 401 handling | ☐ Not started | ☐ |
| 5 | [part-5-value-adds-ux/](part-5-value-adds-ux/) | Real data clients care about (UTM attribution, tags) plus the full UX polish list | ☐ Not started | ☐ |

## How each part runs

1. Jake says "start Part N".
2. Claude implements the spec in that part's `01-implementation-spec.md`, runs typecheck and build, and reports what changed (including anything extra found along the way).
3. Jake reviews the report, then works down `02-manual-actions.md` for that part: deploy, configure, verify.
4. Both boxes ticked in the table above; move to the next part.

## Standing rules

- Parts run in order. Part 3 builds on Part 2's API fixes; Part 4 changes caching that Part 5's UX work assumes.
- All migrations are idempotent and copied to the clipboard with `pbcopy`, never from chat (see part-1 ground rules).
- No em dashes in any UI text, ever.
- If a verification step fails, stop, paste the exact error or describe the screen, and do not continue to the next part.
