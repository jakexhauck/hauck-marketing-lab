# Action wiring: what is left (Phases 2 to 3)

Phase 1 shipped and is LIVE (main `7a27e34`, bundle `index-9W5QD5Kr.js`): Jobs
"Mark completed" / "Message" / "Ask for review", and Leads "Send reply" /
"Not a fit" off-ramp all perform real GHL writes and mirror in demo. Verified by
demo walkthrough; the live data path still needs a Willis-session smoke test.

What follows is the remainder of `action-wiring-live-surfaces.md`. It is NOT
built. Every item below is blocked on the same thing: a live GHL probe that
needs the `ghl` CLI against a real Willis token. That was not available in the
build environment, and guessing the endpoint shapes would risk writing wrong
data to a real client, so these buttons stay gated (they show a clear "turns on
once..." note, they never fake a write).

## Why it is blocked (run these spikes first)

Run each with the `ghl` CLI against Willis, record findings in
`command-center/app/docs/connections/{jobs,leads}.md`, THEN build.

1. **Appointment create + reschedule (v2 shape).** Expected:
   - create: `POST /calendars/events/appointments` with `{calendarId,
     locationId, contactId, startTime, endTime}`
   - reschedule: `PUT /calendars/events/appointments/{eventId}` with a new
     `startTime`/`endTime`
   Confirm WHICH `calendarId` a client books into (the read side discovers
   calendars in `functions/api/calendar/events.ts` and
   `functions/api/sales/jobs/index.ts`; pick the primary or let tenant config
   name it). Blocks: book intro call, book in-person visit, reschedule.

2. **"Pause nurture".** Decide which of these stops the follow-up sequence when
   a call is booked, then confirm against the live Willis workflows:
   - remove from workflow: `DELETE /contacts/{contactId}/workflow/{workflowId}`
   - a stage change the workflow already keys off
   - a "booked" tag the workflow treats as a stop condition (Reviews already
     uses the tag model)
   Until resolved, "book intro call" would still move the stage + book the appt;
   pausing stays a no-op stub with a TODO.

3. **Invoice send + record payment (v2 shape), and how to FIND a job's invoice.**
   Expected `POST /invoices/{invoiceId}/send` and a manual-payment endpoint
   (`POST /invoices/{invoiceId}/record-payment` or equivalent). The `ghl` probe
   returned 0 invoices for Willis, so invoices may be genuinely unused. `ApiJob`
   carries no `invoiceId` today. Blocks: record payment, resend invoice. If
   invoices are effectively unused for Willis, ship "mark paid" as a note/stage
   flag and defer true invoice wiring behind a config flag.

## Remaining actions and the write each needs

| Surface | Button | GHL write | Also needs |
|---|---|---|---|
| Jobs | Reschedule | PUT appointment `startTime/endTime` (spike 1) | a date/time picker modal; `appointmentId` is already on `ApiJob` |
| Jobs | Record payment | record-payment on the job's invoice, else mark-paid note/stage (spike 3) | join a job to its invoice |
| Jobs | Resend invoice | POST invoice send (spike 3) | invoice id |
| Leads | Book intro call (ad) | create appointment (spike 1) + PUT opportunity to Intro Call Waiting Confirmation + pause nurture (spike 2) | calendar picker; stage-name move via the `/stage` endpoint (already built, pass `stageName`) |
| Leads | Schedule a callback (form/chat) | POST contact task with due date (+ pause nurture) | task + optional appt |
| Leads | Book in-person visit (form/chat) | create appointment (spike 1) + PUT opportunity to Estimate Scheduled | calendar picker; `/stage` with `stageName` |

Note: the Leads `/stage` endpoint already accepts a `stageName` and resolves it
BY NAME server-side, so the stage-move half of "book" / "confirm" is ready; only
the appointment-create half is blocked.

## What already exists to build on (do not rebuild)

- `POST /api/sales/leads/:id/stage` (built) resolves a stage by name and/or sets
  status. Ready for a manual Confirm (`{stageName:"Intro Call Confirmed"}`).
- `functions/api/lib/writes.ts` (built): `resolveStageByName`,
  `resolveStageInPipeline`, `putOpportunity`. Add appointment/invoice write
  helpers here, not in `functions/lib/ghl.ts`.
- `ApiJob` now carries `contactId` + `appointmentId`; `HubLead` carries
  `contactId` + `pipelineId` + `pipelineStageId`. The targets are already wired
  through the feeds.
- Existing primitives: `POST /api/contacts/:id/tasks` (callback), the calendar
  read side (calendar discovery), `useCreateTask`.
- Demo: add cases to `src/demo/handlers/actions.ts` (auto-registered). Keep demo
  DATA in each feature's lib. Do NOT put `*.test.ts` in `src/demo/handlers/`
  (the folder is glob-imported into the app bundle; the glob now guards against
  it, but keep tests in `src/demo/*.test.ts`).

## New endpoints to add (after the spikes)

- `functions/api/appointments/index.ts` (POST): create appointment, resolve the
  booking calendar by the read-side discovery.
- `functions/api/appointments/[eventId].ts` (PUT): reschedule.
- `functions/api/nurture/pause.ts` (per spike 2: tag or workflow-remove).
- `functions/api/invoices/[id]/send.ts` + record-payment (per spike 3), plus a
  job-to-invoice join.

## New UI still needed

- A date/time picker modal for Reschedule + all three "book" actions (none
  exists yet; the current NextStep picks just gate).
- Wire the picks in `Jobs.tsx` (Reschedule) and `LeadsHub.tsx` (book / schedule
  / visit) to the new endpoints + the `/stage` move + pause.

## Jake's action items

1. Provide a live Willis GHL token usable with the `ghl` CLI (or run the three
   spikes yourself and paste the endpoint shapes + the booking `calendarId`).
2. Confirm whether Willis actually uses GHL invoices. If not, I ship "mark paid"
   as a note/flag instead of true invoice wiring.
3. Confirm the "pause nurture" mechanism (workflow id to remove, or the stop tag
   / stage the live workflows key off).
4. Smoke-test the LIVE Phase 1 writes in a real Willis session (checklist in the
   Phase 1 handoff): mark a job completed, send a lead reply, off-ramp a lead,
   and confirm each moved in GHL.

Once 1 to 3 land, Phases 2 to 3 are a straight build against the shapes above.
