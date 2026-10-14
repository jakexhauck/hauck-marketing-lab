# Call Console (inbound capture + outcome routing): connections backlog

The Call Console pops when an inbound call hits the business number: a top banner
surfaces the call, and a panel captures an unknown caller's real details and logs
the outcome, routing the lead to the right pipeline stage in one tap. Route 1
telephony (no softphone): the team answers on their phone, the app is the capture
pad.

Status: ⚠️ built, wiring pending Jake. Legend: ❌ not wired · ⚠️ partial · ✅ live.

## The signal (what makes the banner pop)

The banner reads the freshest `call_inbound` row from `/api/notifications`
(`useIncomingCall`), which the webhook writes. To produce that row:

- ⚠️ **Jake action (one step, no code):** on the existing inbound-call workflow
  (trigger: Call Status, Call Direction = Inbound, action already adds tag
  `inbound call`), add a **Send Webhook** action:
  - URL: `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`
  - Method: POST, custom JSON body:
    `{ "type": "InboundCall", "locationId": "{{location.id}}", "contactId": "{{contact.id}}", "phone": "{{contact.phone}}", "firstName": "{{contact.first_name}}", "lastName": "{{contact.last_name}}" }`
- ✅ **Webhook handling:** `functions/api/webhook.ts` maps `type: "InboundCall"`
  to a `call_inbound` activity_log row (payload carries the raw event incl. phone
  + name) and fires a push. The push wakes the phone; the in-app banner polls the
  notifications feed (30s) and pops on the newest fresh call (within 5 minutes).

## Secrets / env

- ⚠️ `WEBHOOK_SECRET` must be set (same value in the workflow URL and the env var),
  or the webhook fails closed. Already used by the appointment-confirm flow.
- ✅ Per-tenant GHL token + location injected server-side (same pattern as the rest
  of the client app). Confirm the token scope covers Contacts (write), Opportunities
  (create + stage write), and Conversations.

## Endpoints (built this branch)

- ✅ `PUT /api/contacts/:contactId`: upsert the caller's captured details
  (firstName, lastName, email, postalCode, source). Writes only present fields, so
  a partial capture never blanks existing data. Hook: `useUpsertContact`.
- ✅ `POST /api/sales/leads`: create an opportunity for an existing contact by
  pipeline + stage name (the path for an unknown caller who has no opportunity yet).
  Hook: `useCreateSalesLead`.
- ✅ `POST /api/sales/leads/:id/stage`: extended to accept `pipelineName`
  (cross-pipeline move, e.g. into the Sales Pipeline "Job Booked") and
  `monetaryValue`. Fails closed: a cross-pipeline move only writes when BOTH the
  pipeline and the stage resolve by name. Hook: `useMoveSalesLeadStage`.
- ✅ `POST /api/contacts/:contactId/notes` (pre-existing): the auto-note on ring
  ("New inbound caller, needs details") and the "what they want" note. Hook:
  `useCreateNote`.

## Outcome taps -> stage + function map

Stage names are resolved BY NAME per tenant (see `functions/api/sales/leads/index.ts`
`STAGE_STATUS`). For a KNOWN caller the existing opportunity is moved; for an UNKNOWN
caller the opportunity is created at the target stage first.

| Tap | Function | Target stage |
|---|---|---|
| Booked the job | `useMoveSalesLeadStage` / `useCreateSalesLead` + `monetaryValue` | Sales Pipeline "Job Booked" |
| Book in-person visit | `useFreeSlots` + `useCreateAppointment` ("Home Estimate") + stage move | "Estimate Scheduled" |
| Follow up later | `useCreateTask` (callback due date) + stage move | "Follow Up" |
| No answer / voicemail | `useMoveSalesLeadStage` | "No Answer" |
| Not qualified | `useMoveSalesLeadStage` `{status:"lost"}` (known) / created at "Not Qualified" (unknown) | off-ramp / lost |

## Per-action gating (turns real when its dependency lands)

- Banner + console → the `call_inbound` webhook signal (needs the Send Webhook action + WEBHOOK_SECRET).
- Capture Save → `PUT /api/contacts/:id` (live) + note write (live).
- Outcome taps → the stage/create/appointment/task endpoints above (all live server-side).
- Write failures surface an error toast in the console, so a failed tap during a live call is visible, not silent.

## Open verification (not a blocker, confirm on the first real call)

- **Call-trigger timing:** does the GHL Call Status trigger fire when the phone
  RINGS (true live pop) or only when the call ENDS (pop right after hang-up)? The
  build is identical either way; it only changes whether the banner appears mid-call
  or seconds after. Confirm by placing a test call.
- **Known-caller opportunity match:** the console finds an existing opportunity by
  matching the merged leads feed on `contactId`. Confirm a known caller who already
  has an opportunity routes their existing one (rather than creating a duplicate).
- **Home Estimate booking:** the visit flow books on the "Home Estimate" calendar
  (event-type, bookable today per `connections/leads.md`). Intro-call calendars still
  need staff assigned before they can be booked from anywhere.

## Post-build (Jake action checklist)

1. Add the `Send Webhook` action to the inbound-call workflow (payload above).
2. Confirm `WEBHOOK_SECRET` is set in the env and matches the workflow URL token.
3. Place a live test call into the business number; confirm the banner pops (note ring vs hang-up).
4. On the call, type the caller's name/ZIP + Save; confirm the details land on the real contact.
5. Tap each outcome once and confirm the opportunity moves to the expected stage.
