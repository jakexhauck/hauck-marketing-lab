# Connections — Jobs (Sales) · `/sales/jobs`

The month-calendar view over the GHL **Sales Pipeline** (`6o9Gx6e0TXRFJdln5d01`) at
its two job stages: **Job Booked** and **Job Completed**. The tail of the Sales spine.
Ships **demo-complete but not connected**: real sessions show the empty calendar +
not-connected notice, and every terminal action is gated (toast, no write) until the
backend exists.

Status key: ❌ not wired · ⚠️ partial · ✅ live

## Wired 2026-07-02 (action-wiring plan, Phase 1)
- ✅ **Mark completed** → `POST /api/sales/jobs/:id/complete` (new). Resolves the Sales
  pipeline + "Job Completed" stage BY NAME server-side and PUTs the opportunity; the
  client sends no stage id. Optimistic cache flip so the dot + month summary recompute
  at once (`useCompleteJob`). Demo mirrors it in `src/demo/handlers/actions.ts`.
- ✅ **Message** → opens an SMS composer keyed by the job's `contactId` (now on `ApiJob`),
  sending through the existing `POST /api/conversations/:id/send`.
- ✅ **Ask for review** → existing `POST /api/reviews` tag flow, keyed by `contactId`.
## Wired 2026-07-05 (action-wiring plan, Phases 2-3)
- ✅ **Reschedule** → new `PUT /api/appointments/:eventId` (`functions/api/appointments/[eventId].ts`),
  targeted by the job's `appointmentId`. Opens a date/time picker (`DateTimeModal`).
  `useRescheduleAppointment`. Confirmed live shape against Willis.
- ✅ **Record payment** → new `POST /api/sales/jobs/:id/payment`
  (`functions/api/sales/jobs/[id]/payment.ts`). Willis has 0 GHL invoices, so this
  records the payment as a durable contact NOTE and flips the job `paid` flag
  (optimistic dot recolour, `useMarkJobPaid`), not a fake invoice.
- ⛔ **Resend invoice** → intentionally not wired. GHL invoices are unused on Willis
  (probe returned 0), so the button shows an honest "invoices are not set up, nothing to
  resend" note. True invoice send stays behind a future config flag.

### Spike results (2026-07-05, live Willis `ghl` CLI probe, all writes cleaned up)
API version header `2021-04-15` for all `/calendars/*`.
- Create: `POST /calendars/events/appointments` `{calendarId, locationId, contactId,
  startTime, endTime, title?}` → 201 `{id, status:"booked", appointmentStatus:"confirmed"}`.
  `selectedSlot` NOT required. Verified on the Home Estimate (event-type) calendar.
- Reschedule: `PUT /calendars/events/appointments/{eventId}` `{startTime, endTime}` → 200.
- Cancel: `DELETE /calendars/events/{eventId}` → 200.
- Slots: `GET /calendars/{calendarId}/free-slots?startDate={ms}&endDate={ms}&timezone={tz}`
  → 200 `{ "YYYY-MM-DD": { slots:[ISO] }, traceId }`. `startDate`/`endDate` MUST be epoch
  millis; do NOT pass `calendarId` as a query param.
- CAVEAT: create/free-slots only work on EVENT-type calendars. Round-robin calendars with
  no team members 422 "The calendar doesn't have any team members associated" (passing
  `assignedUserId` does not override). Home Estimate is an event calendar and works.
- Invoices: `payments invoices` returned 0. Confirmed unused → mark-paid via note.

## Data source(s)
- ❌ **GHL Sales Pipeline opportunities** — the jobs. Read opportunities in pipeline
  `6o9Gx6e0TXRFJdln5d01` at stages `Job Booked` + `Job Completed`; map each to a `Job`
  (`src/lib/jobsPipeline.ts`). `status` = which of the two stages; `amount` = the
  opportunity value.
- ❌ **GHL appointments / calendar** — each job's date + time. The opportunity carries the
  stage + value but not the scheduled slot; join the linked appointment (or a date custom
  field) to populate `date`/`time`/`startMinutes`. Make-or-break for the calendar layout.
- ❌ **Payment status** — the `paid` flag (completed-but-unpaid is called out in amber).
  Source TBD: a GHL invoice/payment record or a "paid" opportunity custom field. Confirm
  where Willis records job payment.
- ❌ **GHL conversations** — the thread opened by the "Message" action (same thread the
  Unified Inbox reads; never a copy).

## AI
- None for v1.

## Backend endpoints
- ❌ `GET /api/sales/jobs` — opportunities at the two job stages + joined appointment
  (date/time) + value + payment status. Could be a stage-filtered extension of the shared
  opportunities fetch rather than a new endpoint.
- ❌ `POST /api/sales/jobs/:id/complete` — move `Job Booked` → `Job Completed`.
- ❌ `POST /api/sales/jobs/:id/reschedule` — update the linked appointment's date/time
  (writes back to the GHL calendar).
- ❌ `POST /api/sales/jobs/:id/payment` — record amount + mark paid (feeds Revenue).
- ❌ `POST /api/sales/jobs/:id/invoice` — (re)send the invoice for an unpaid completed job.

## Auth / identity
- ⚠️ Session mode (live vs test) + the per-tenant GHL location token, injected server-side
  (same pattern as the rest of the client app). Not specific to this page.

## Secrets / env vars
- GHL location API token / PIT (exists for Willis) — reused. No new secrets.

## Webhooks
- ❌ GHL appointment created/updated → keep the calendar fresh without a full refetch
  (optional; polling on load is fine for v1).

## Persistence
- None beyond GHL (the pipeline + calendar are the source of truth).

## Per-action gating (what turns each on)
- **Mark completed** → `complete` endpoint (pipeline stage move).
- **Reschedule** → `reschedule` endpoint + GHL calendar write.
- **Record payment** → `payment` endpoint (+ the chosen payment source).
- **Resend invoice** → `invoice` endpoint (GHL invoices).
- **Message** → GHL conversations (open the thread).
- **Ask for review** → the Google Reviews request flow (shared with `/marketing/reviews`).
