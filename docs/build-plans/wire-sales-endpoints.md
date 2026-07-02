# Wire sales endpoints (Forms/Chat + Paid-Ads leads + Jobs + Webhook)

Branch: `feat/wire-sales-endpoints`. Package: `command-center/app` (the one
responsive app: desktop sidebar + phone PWA, same routes/data). AI is OUT of
scope. A2P is verified for Willis (SMS send works).

## The wiring contract (identical for every surface)

- **Real session:** frontend lib calls `api('/api/...')` -> new Pages Function -> GHL.
- **Demo session:** `api()` short-circuits to `handleDemoRequest(path)` in
  `src/demo/handler.ts`, which returns the existing hand-authored demo arrays.

So each surface = (1) build the endpoint, (2) switch the frontend lib from
`demo ? DEMO_X : []` to `api('/api/...')`, (3) add a `handleDemoRequest` case
that returns the same `DEMO_X` array. Desktop, mobile, and demo all stay in sync
because they share the lib.

## Grounding (verified live against Willis GHL, location `OznT3yyuwK3dqVXDsCaD`)

Pipelines (real IDs + stage order):

- **Paid Ad's Pipeline** `uz0fFxCgiwdXbg4Zmwkc` — [0]Lead In [1]Lead In No Appointment Booked
  [2]Lead Responded [3]No answer [4]Not Qualified [5]Intro Call Waiting Confirmation
  [6]Intro Call No Confirmation [7]Estimate Scheduled [8]Apt Completed/ Quote Given [9]Followup - Not ready
- **Organic Pipeline** `NSkPBlP8BcPTtyibNEIu` — [0]Lead In [1]Lead Responded [2]No Answer
  [3]Not Qualified [4]Estimate Scheduled [5]Estimate Completed/Quote Given [6]Follow Up - Not Ready [7]No Show
- **Sales Pipeline** `6o9Gx6e0TXRFJdln5d01` — [0]Intro Call Confirmed [1]Estimate Scheduled
  [2]Estimate Completed [3]**Job Booked** [4]**Job Completed** [5]No-Close [6]Follow Up [7]Abandoned
- Database Reactivation `A7PNIqk4Fg1HINtirAmR`; Google Review Campaign `R76ncRGrODiJuDJJTUWR`.

IDs differ per tenant. Resolve pipelines/stages **by name** (exact then contains),
never hardcode IDs. See `functions/api/reviews/index.ts` for the name-resolution pattern.

Reusable helpers in `functions/lib/ghl.ts`:
- `fetchAllOpportunities(ctx, {pipelineId})` — paginated opps.
- `shapeOpportunity(o) -> ApiLead` — `{id,name,phone,email,contactId,pipelineId,pipelineStageId,status,value,createdAt,lastActivityAt,assignedUserId}`.
- `createContact`, `createOpportunity`, `ghlJson`, `altQuery`.
- Opportunity carries `source` and (on the contact join) `tags`.
- `ctx = { token: t.ghl_token, locationId: t.ghl_location_id }` from `ctx.data.tenant`.

Existing live endpoints to reuse (do NOT rebuild): `/api/conversations/:contactId/messages`,
`/api/conversations/:contactId/send`, `/api/calendar/events`, `/api/leads`.

Verify: `npm run typecheck` (app + functions) and `npm run build` in `command-center/app`.

## Workstreams

### A — Lead feeds
- `GET /api/ads/leads` — Paid Ad's Pipeline opps, shaped, sorted by activity.
- `GET /api/forms/submissions?source=` — Organic Pipeline opps, split Website Form vs chat widget by `source`.
- `GET /api/sales/leads` — merged Paid + Organic with source + status + latest-message preview.
- Wire `src/lib/paidAdsPipeline.ts`/`AdsLeads.tsx`, `src/lib/estimateForms.ts`, `src/lib/chatWidget.ts`, `src/lib/leadsHub.ts`.
- Reply/thread = existing conversations endpoints. Follow-up tracker STAYS on the demo `fu` field (no clean GHL source yet — out of scope).

### B — Jobs
- `GET /api/sales/jobs` — Sales Pipeline opps at **Job Booked** + **Job Completed**, joined to the appointment (date/time) via the calendar pattern.
- Wire `src/hooks/useJobs.ts`, `src/lib/jobsPipeline.ts`, `src/routes/sales/Jobs.tsx`.
- Stage-write actions (complete/reschedule/payment/invoice) = follow-up; read path first.

### C — Webhook handler (step 3)
- Extend `functions/api/webhook.ts`: inbound-message event -> mark thread fresh; appointment-confirmation event -> flip "awaiting confirm" -> "confirmed".
- Auth reuses `WEBHOOK_SECRET` / `functions/lib/webhookAuth.ts` (already set from internal-notify).
- Jake registers the workflow webhook in GHL after; hand him the exact URL + header.

## Out of scope (parked)
Campaigns, Social, client Assets Drive, all AI, email sending domain, follow-up automation state.
