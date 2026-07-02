> ## Run this build (read first)
>
> You are a Claude instance executing this plan autonomously, start to finish.
>
> 1. `git pull origin main`, then create a **git worktree** for this build (invoke the `using-git-worktrees` skill) so you never collide with the other parallel builds.
> 2. Read this whole doc, especially the **Isolation contract** at the bottom. Only create or edit the files it says you own. Put demo cases in `src/demo/handlers/<feature>.ts` (auto-registered; template in `src/demo/handlers/reactivation.ts`), never in `src/demo/handler.ts`.
> 3. **Build Phase 1 first** (stage moves, log-outcome notes, sends): it has no external blocker. Phases 2-3 have spikes (appointment / invoice endpoints, "pause nurture"); run those spikes before building, and if a GHL endpoint does not exist, report and skip that one action rather than faking it.
> 4. Build to the wiring contract: real session calls `api('/api/...')` to a Pages Function to GHL; demo session hits the handler. Resolve GHL pipelines/stages BY NAME (id fallback). Terminal actions stay gated and demo-aware. A real client never sees fabricated data. Never use em dashes anywhere.
> 5. Verify from `command-center/app`: `npm run typecheck`, `npm test`, `npm run build`, and walk the surface at `?demo=1`. No "should work" without running it.
> 6. Ship: stage ONLY your files, commit, rebase on main, `git push origin main` (your files are disjoint from the other builds so it merges clean), watch the live bundle hash change (`curl -s https://hauck-dashboard.pages.dev/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`), then grep the new bundle for a string you shipped. Report what shipped, any spike results, and anything left.

# Wire the write actions on already-live surfaces

Package: `command-center/app` (the one responsive app: desktop sidebar + phone
PWA, same routes/data). Follow-up to `wire-sales-endpoints.md`: the READ paths
for Jobs, Leads, Paid-Ads leads, and Forms/Chat are live. This plan wires the
action buttons on those surfaces (the ones that currently fire a gated toast and
write nothing). AI is OUT of scope. A2P is verified for Willis (SMS send works).

## The wiring contract (identical for every action)

- Real session: the frontend hook calls `api('/api/...')` with a write method ->
  a Pages Function -> GHL.
- Demo session: `api()` short-circuits to `handleDemoRequest()` in
  `src/demo/handler.ts`, which mutates the in-memory store and returns success,
  so the demo behaves like a live account and never touches a real client.
- Pipelines/stages are resolved BY NAME per tenant (exact then contains, id
  fallback only), never hardcoded. See `functions/api/sales/jobs.ts` and
  `functions/api/reviews/index.ts` for the resolution pattern.
- Terminal actions stay demo-aware and gated: in a real session with nothing
  connected they must degrade cleanly, not error.

## Goal + Definition of Done

Every action button below performs a real GHL write in a live session, updates
the surface optimistically (react-query invalidation), and mirrors into the demo
store so `?demo=1` still behaves. Done when:

1. Each action calls a real endpoint (no `GATED_NOTE` / `onAction` toast left on
   a wired button).
2. `npm run typecheck` (app + functions) and `npm run build` pass in
   `command-center/app`.
3. `npm test` passes, including a demo-handler case for every new write path.
4. A demo walkthrough shows each action mutating the store (stage flip, message
   in thread, note added).
5. Live path is left for Jake to smoke-test in a real Willis session (every
   `/api/*` is 401 without a session).

## What already exists (reuse, do NOT rebuild)

Backend primitives:

- `PATCH /api/leads/:id` (`functions/api/leads/[id].ts`) -> `PUT
  /opportunities/{id}` with `{pipelineStageId, status, value, notes}`. This is
  the one primitive for EVERY opportunity stage move + optional contact note.
  `status` accepts `open | won | lost | abandoned`.
- `POST /api/conversations/:contactId/send` (`send.ts` -> `sendChannelMessage`
  in `functions/lib/messaging.ts`): channel-aware send (SMS/Email/FB/IG/...).
- `POST /api/reviews` (`reviews/index.ts`): adds a GHL tag to a contact to
  enrol a workflow. The template for any "add tag to trigger/pause a workflow"
  action.
- `POST /api/contacts/:contactId/notes` and `.../tasks`: contact notes + tasks.
- Helpers in `functions/lib/ghl.ts`: `ghlJson`, `ghlFetch`, `altQuery`,
  `fetchAllOpportunities`, `shapeOpportunity`, `createContact`,
  `createOpportunity`. `ctx = { token: t.ghl_token, locationId: t.ghl_location_id }`.

Frontend hooks (`src/hooks/useApi.ts`):

- `useUpdateLead()` / `useMoveLeadStage(pipelineId)` -> PATCH lead (stage/status/
  value/notes). The Pipeline board at `/sales/leads/pipeline` already drives
  stage moves through this, so off-ramp moves are a solved pattern.
- `useSendConversationMessage()` -> POST send.
- `useStartReviewCampaign()` -> POST tag.
- `useCreateNote()`, `useCreateTask()`.

## Unknowns / spikes to resolve BEFORE Phase 1

These block the appointment + payment actions; the stage-move + message + note
actions do not depend on them and can ship first.

1. **GHL appointment create + reschedule endpoints.** Confirm the v2 shape.
   Expected: create `POST /calendars/events/appointments` with `{calendarId,
   locationId, contactId, startTime, endTime}`; reschedule `PUT
   /calendars/events/appointments/{eventId}` with a new `startTime/endTime`.
   Confirm which `calendarId` a client books into (the read side discovers
   calendars in `calendar/events.ts` / `sales/jobs.ts`; pick the primary, or
   let the tenant config name it). Verify against Willis with the `ghl` CLI
   before building. Blocks: book intro call, book in-person visit, reschedule.
2. **"Pause nurture".** Determine whether pausing the follow-up sequence is:
   (a) removing the contact from a workflow (`DELETE
   /contacts/{contactId}/workflow/{workflowId}`), (b) a stage change the
   workflow already keys off, or (c) adding a "booked" tag the workflow treats
   as a stop condition. Reviews uses the tag model already. Pick one, confirm
   against the live Willis workflows, document in `docs/connections/leads.md`.
   Until resolved, "book intro call" still moves the stage and books the appt;
   pausing is a no-op stub with a TODO.
3. **Invoice send + record payment.** Confirm `POST /invoices/{invoiceId}/send`
   and the manual-payment endpoint (`POST /invoices/{invoiceId}/record-payment`
   or equivalent) in GHL v2, and how to FIND a job's invoice (the `ghl` probe
   returned 0 invoices for Willis, so this may be genuinely empty). Jobs read
   side does not carry an invoice id today. Blocks: record payment, resend
   invoice. If invoices are effectively unused for Willis, ship payment as a
   "mark paid" note/stage flag and defer true invoice wiring.

## Actions by surface -> the GHL write each needs

### Jobs (`src/routes/sales/Jobs.tsx`, `useJobs.ts`, `jobsPipeline.ts`, `functions/api/sales/jobs.ts`)

| Button | GHL write |
|---|---|
| Mark completed (booked job) | PUT opportunity: `pipelineStageId` -> Job Completed (Sales Pipeline) |
| Reschedule | PUT appointment `startTime/endTime` (spike 1) |
| Message | POST conversations send (already exists) |
| Record payment | record-payment on the job's invoice, else mark-paid note/stage (spike 3) |
| Resend invoice | POST invoice send (spike 3) |
| Ask for review (paid job) | POST /api/reviews tag (already exists) |

Data gap: `ApiJob` (in `sales/jobs.ts`) exposes only `id` (= opportunity id),
no `contactId`, no `appointmentId`, no `invoiceId`. Add `contactId` (already on
the opportunity) and `appointmentId` (already joined via `appointmentsByContact`)
to `ApiJob` and to the `Job` type in `jobsPipeline.ts` so Message / Reschedule
have what they need. `invoiceId` waits on spike 3.

### Leads + Paid-Ads leads (`src/routes/sales/LeadsHub.tsx`, `src/lib/leadsHub.ts`, `functions/api/sales/leads/index.ts`, board reuses `useMoveLeadStage`)

| Action (NextStepModal / composer) | GHL write |
|---|---|
| Send reply (composer) | POST conversations send |
| Book intro call (ad) | create appointment (spike 1) + PUT opportunity -> Intro Call Waiting Confirmation + pause nurture (spike 2) |
| Confirm | PUT opportunity -> Intro Call Confirmed (Sales Pipeline) [note: webhook also auto-confirms; this is the manual path] |
| Off-ramp / Not a fit | PUT opportunity -> Not Qualified / Followup - Not ready, or `status: lost/abandoned` |
| Log call outcome | POST contact note (+ optional stage move: No Answer / Lead Responded) |

Data gap: `mapApiSalesLead` in `leadsHub.ts` drops `contactId`, `pipelineId`,
`pipelineStageId` (all present on `ApiSalesLead`). Carry them onto `HubLead` so
the composer and stage moves have their targets.

### Forms / Chat (same LeadsHub surface, `form` + `chat` tabs)

| Action | GHL write |
|---|---|
| Log call outcome | POST contact note (+ optional stage move) |
| Schedule a callback | POST contact task with due date (+ pause nurture, spike 2) |
| Book in-person visit | create appointment (spike 1) + PUT opportunity -> Estimate Scheduled |

## File-by-file build steps

Ship in three phases; Phase 1 has no external unknowns.

### Phase 0 - spikes
- Resolve spikes 1-3 above with the `ghl` CLI against Willis. Record findings in
  `command-center/app/docs/connections/leads.md` and `.../jobs.md`.

### Phase 1 - stage moves, sends, notes (no spike needed)

New endpoint: `functions/api/sales/jobs/[id]/stage.ts` (or fold into a small
`POST /api/sales/jobs/:id/complete`). Resolves the Sales pipeline + target stage
BY NAME (reuse the resolver in `sales/jobs.ts`) and PUTs the opportunity. Keeps
stage-name knowledge server-side so the client never hardcodes ids.

Edit `functions/api/sales/jobs.ts`: add `contactId` and `appointmentId` to
`ApiJob` (both already available in the handler).

Edit `functions/api/sales/leads/index.ts`: nothing required (contactId already
in the shape); confirm `pipelineId`/`pipelineStageId` pass through
`shapeOpportunity` (they do).

Edit `src/lib/jobsPipeline.ts`: add `contactId` + `appointmentId` to the `Job`
type. Edit `src/lib/leadsHub.ts`: add `contactId`, `pipelineId`,
`pipelineStageId` to `HubLead` and copy them in `mapApiSalesLead`.

Wire frontend:
- `src/routes/sales/Jobs.tsx`: replace `onAction("Mark completed")` with a
  mutation to the jobs stage endpoint; wire `Message` and `Ask for review` to
  the existing hooks. Keep Reschedule/Payment/Invoice gated until Phase 2/3.
- `src/routes/sales/LeadsHub.tsx`: wire the composer Send button (currently
  `onGated`) to `useSendConversationMessage()` keyed by `lead.contactId`, and
  wire the NextStepModal `Confirm` / `Off-ramp` / `Log call outcome` picks to
  `useMoveLeadStage` + `useCreateNote`. Add per-tenant stage-name -> stage-id
  resolution (fetch `/api/pipelines`, match by name) so the client sends a real
  `pipelineStageId`, or add a thin `POST /api/sales/leads/:id/stage` that
  resolves by name server-side (preferred, mirrors the jobs stage endpoint).

New hooks in `src/hooks/useApi.ts` as needed: `useCompleteJob`,
`useMoveSalesLeadStage` (thin wrappers over the new endpoints), reusing the
existing invalidation pattern.

Demo handler (`src/demo/handler.ts`): add cases for every new path:
- `POST /api/sales/jobs/:id/complete|stage` -> mutate the demo job's status in a
  small in-memory override map, return `{ ok: true }`.
- `POST /api/sales/leads/:id/stage` -> update the demo lead's `status`/`stageName`.
- Confirm the existing `/api/conversations/:contactId/send`,
  `/api/contacts/:id/notes`, `/api/contacts/:id/tasks` demo cases cover the
  Leads/Forms actions (they already exist).

### Phase 2 - appointments (after spike 1 + 2)

New endpoints:
- `functions/api/appointments/index.ts` (`POST`): create an appointment
  `{contactId, startTime, endTime, calendarId?}`; resolve the booking calendar
  by the same discovery used on the read side.
- `functions/api/appointments/[eventId].ts` (`PUT`): reschedule.
- Optional `functions/api/nurture/pause.ts` per spike 2 (tag or workflow-remove).

Wire:
- Jobs `Reschedule` -> PUT appointment (needs `appointmentId` from Phase 1).
- LeadsHub `Book intro call` -> create appointment + stage move + pause.
- LeadsHub `Book in-person visit` + `Schedule a callback` -> create appointment /
  task + stage move + pause.
Demo handler: add `appointments` create/reschedule + `nurture/pause` cases that
mutate the store (push an event onto `d.calendar`, flip the lead).

### Phase 3 - payments/invoices (after spike 3)

New endpoints under `functions/api/invoices/`: send (`POST
/api/invoices/:id/send`) and record-payment. Join a job to its invoice (contact
or opportunity lookup). Wire Jobs `Record payment` + `Resend invoice`. If
invoices prove unused for Willis, ship a "mark paid" note/flag instead and leave
true invoice send behind a config flag. Demo handler: add invoice send +
record-payment cases against the existing `d.invoices` store.

## Verification steps

Run in `command-center/app`:

1. `npm run typecheck` (app + functions Worker types).
2. `npm test` (Vitest), including the new demo-handler cases.
3. `npm run build`.
4. Demo path: open the app with `?demo=1`, then for each surface: mark a booked
   job completed (dot flips green), send a reply in a lead thread (bubble
   appears), pick Confirm / Off-ramp on a lead (status pill changes), log a call
   outcome (note recorded). Confirm no console 404 from `handleDemoRequest`.
5. Hand Jake the live smoke-test list: in a real Willis session, complete a job,
   confirm a lead, send a reply, and verify the opportunity/stage moved in GHL.

## Out of scope (parked)

Follow-up automation state (the `fu` tracker stays on demo data until the
workflow-history spike lands), email sending domain, Social/Website surfaces,
all AI. The appointment-confirmation webhook is already shipped but dormant;
registering it is separate from the manual Confirm action here.

---

## Isolation contract (this runs in parallel with the other five plans)

Run this build in its own Claude instance + its own git worktree ("create a git
worktree for this build"). Stay inside the files below so parallel builds never
clobber each other. Merge to main one plan at a time.

- **You own:** new action endpoints under `functions/api/` (e.g.
  `functions/api/jobs/[id]/*.ts`, `functions/api/leads/[id]/*.ts`); the Sales
  route components you wire (`src/routes/sales/Jobs.tsx`, the Leads `LeadsHub` /
  `Board`, the lead-detail view) and their hooks; your demo cases in
  `src/demo/handlers/actions.ts`.
- **Demo:** add `src/demo/handlers/actions.ts` (auto-registered; template in
  `src/demo/handlers/reactivation.ts`). NEVER edit `src/demo/handler.ts` or
  `src/demo/data.ts`.
- **GHL helpers:** put opportunity/appointment/invoice write helpers in a feature
  file (e.g. `functions/api/lib/writes.ts`), not in `functions/lib/ghl.ts`
  (append-only there if a helper is truly generic; note it in the commit).
- **Do not touch:** `src/routes/social/*`, `src/routes/campaigns/*`,
  `functions/api/ads/*`, `src/lib/calendarModel.ts`, `src/App.tsx`, `src/lib/nav.ts`.
- `src/lib/leadsHub.ts` is shared with the follow-up-automation plan, but that one
  is read-only in its spike phase, so you have write priority.
