# Marketing surfaces: consolidated build plan

Master plan tying together the four remaining client-app builds: **Social**,
**Actions** (write buttons on Jobs/Leads/Forms), **Campaigns** (SMS), and
**Calendar** (social + campaign streams). Each has its own detailed spec (linked
below); this doc is the current-status snapshot, the shared unblock, and the
build order. App: `command-center/app` (one responsive app, desktop + PWA).

Last updated 2026-07-05.

## Status snapshot

| Surface | What is live now | What is left | Detailed plan |
|---|---|---|---|
| **Social** | Demo populated; real session = honest "not connected". FB/IG/Google connected in the sub-account; the `socialplanner/*` token scope is now ADDED (was the blocker). | Wire Overview / My Posts / Calendar / Composer to real GHL Social Planner. Insights only if an analytics endpoint exists. AI stays out. | `social-wiring.md` |
| **Actions** | Phase 1 SHIPPED + live (`7a27e34`): Jobs Mark completed / Message / Ask for review; Leads Send reply / Not-a-fit off-ramp. `POST /api/sales/leads/:id/stage` + `functions/api/lib/writes.ts` exist; `ApiJob` carries contactId+appointmentId, `HubLead` carries the pipeline ids. | Phases 2-3: appointments (book intro call, book visit, reschedule), callbacks, invoices/payments, pause-nurture. | `action-wiring-remaining.md` |
| **Campaigns** | DONE (read-only view): Reactivation + Audiences both live & real (`/api/campaigns/reactivation`, `/api/campaigns/audiences`, 4 real segments). | Nothing active. SMS Send DROPPED (client is read-only; agency sends from GHL). Stats left honest-empty (no client send = no history). Email deferred (sending domain). Optional Phase B: agency send tool + campaign log. | `campaigns-sms-wiring.md` |
| **Calendar** | Appointments + Jobs streams live. Social + Campaign streams demo-only. | Two pure mappers + merge the Social & Campaign feeds; flip `connected` per non-empty feed. | `calendar-social-campaign-streams.md` |

## The one real blocker: a single GHL spike pass

Every remaining build gates on the same thing: **confirming GHL endpoint shapes
against the live Willis token** before writing handlers (guessing shapes risks
wrong writes to a real client). All probes use the same tool (`ghl` CLI in
`gohighlevel-cli/`, run via `ghl.ps1` with `PYTHONUTF8=1`, Willis-scoped PIT).

Run them in ONE session, record each result in the matching
`command-center/app/docs/connections/*.md`, and the four builds become straight
execution. Consolidated probe list:

**Social (unblocks Social)**
- Token carries `social-media-posting.readonly` / `.write`? (scope now added, confirm it works)
- `GET /social-media-posting/{locationId}/accounts` shape (fb/ig/gb ids + platform names)
- List posts: `POST .../posts/list` vs `GET .../posts`, status enum, schedule/published date fields, date-range params
- Create/schedule/delete post body shape (test sub-account only)
- Does ANY per-post analytics endpoint exist? If not, Insights stays deferred (documented, not faked)

**Actions (unblocks Actions Phases 2-3)**
- Appointment create `POST /calendars/events/appointments` + reschedule `PUT .../{eventId}`; which `calendarId` a client books into
- Pause-nurture mechanism: workflow-remove vs stop-tag vs stage the live workflow keys off
- Invoice send + record-payment shapes, how to find a job's invoice, and whether Willis uses GHL invoices at all (probe returned 0)

**Campaigns (unblocks Campaigns)**
- Segment field logic on real Willis contacts (all/past/vip/new are derivable; fivestar/noac need a tag/custom-field, omit if absent)
- SMS blast mechanism: Option A per-contact loop over `sendChannelMessage` (recommended, reuses audited path) vs Option B GHL bulk-action; idempotency (server campaignId + contact tag)
- `{{first}}` personalization (avoid double-substitution), schedule-later worth wiring?, stats source (conversation-search by campaign tag vs a report endpoint)

**Calendar** — no GHL probe of its own; it only maps the Social + Campaign feeds. Its dependency is those two builds exposing scheduled rows.

## Build order and dependencies

1. **Spike pass** (above). Unblocks 2-4. One session, ~half a day.
2. **Social**, **Actions P2-3**, **Campaigns** — independent of each other; can run in **parallel** (separate worktrees, disjoint file ownership per each plan's isolation contract). Merge one at a time.
3. **Calendar** — LAST. Data-depends on Social + Campaigns feeds exposing scheduled posts / sends (`useSocialPosts` and a `/api/campaigns/sends`-style hook). Until both exist it stays `connected: false` (no regression).

Priority if done serially (highest client value first): **Campaigns SMS** (a real send is a visible capability) → **Social** (whole section goes real) → **Actions P2-3** (booking flow) → **Calendar** (overlay polish).

## Cross-cutting rules (hold for every build)

- **Wiring contract:** real session `api('/api/...')` → Pages Function → GHL; demo session → `handleDemoRequest()` / the auto-registered `src/demo/handlers/<feature>.ts`. Same return shapes both ways. Never edit `src/demo/handler.ts`.
- **Resolve pipelines/stages BY NAME** per tenant (exact, then contains, id fallback). Reuse `functions/api/lib/writes.ts` (`resolveStageByName`, `putOpportunity`).
- **Terminal actions gated + demo-aware:** sends/creates only fire in a live session with the capability present; demo is a no-op success. No POST retries.
- **Never name GoHighLevel / GHL / pipelines / opportunities in client-facing UI.** Customer language only.
- **A real client never sees fabricated data.** Connected-but-empty shows the honest empty state, never demo rows.
- **No em dashes anywhere.** Demo (`?demo=1`) stays visually unchanged.
- **Verify before ship:** `npm run typecheck` + `npm test` + `npm run build` from `command-center/app`; walk the surface at `?demo=1`; then commit → rebase → push → watch the live bundle hash change → grep it for a shipped string. Live `/api/*` is 401 unauthenticated, so the real-data path is Jake's smoke test in a Willis session.

## What needs Jake

1. **The spike pass:** confirm the `ghl` CLI works against Willis, or let me run it (the Willis PIT is in Doppler `GHL_TOKEN`). This is the gate for everything else.
2. **Invoices:** does Willis actually use GHL invoices? If not, Actions ships "mark paid" as a note/stage flag instead of true invoice wiring.
3. **Pause-nurture:** which workflow/tag/stage the live Willis follow-up keys off.
4. **Test-send go-ahead:** permission to fire one real SMS (Campaigns) and schedule+delete one throwaway post (Social) against the TEST sub-account first, then a 1-contact Willis segment, before any real customer blast.
5. **Smoke-test the shipped Actions Phase 1** in a real Willis session (mark a job completed, send a lead reply, off-ramp a lead) and confirm each moved in GHL.

## Next step

The highest-leverage move is to run the spike pass now (the CLI + Willis token
exist), which converts all four "blocked" plans into "ready to build". I can run
it and paste the real shapes back into each connection doc, then execute the
builds in priority order.
