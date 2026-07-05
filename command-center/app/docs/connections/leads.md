# Leads — connections backlog

The merged **Leads** surface (`/sales/leads`): Paid Ads + Estimate Forms + Chat Widget on one page, three in-line source tabs. Replaces the old Sales "Channels" group (the per-channel routes `/sales/paid-ads`, `/sales/forms`, `/sales/chat` still resolve for deep links but are out of the sidebar).

Ships **demo-complete but not connected**: a real session renders the empty/not-connected state, and every terminal action is gated until the feeds land. Status: ❌ not wired · ⚠️ partial · ✅ live.

Reads its data through `useLeadsHub()` → `buildLeadsHub()` in `src/lib/leadsHub.ts` (hand-authored demo worklist today; empty in a real session). Keep this return shape when wiring live and nothing downstream changes.

## Wired 2026-07-02 (action-wiring plan, Phase 1)
- ✅ **Send reply (composer)** → existing `POST /api/conversations/:contactId/send`, keyed by
  the lead's `contactId` (now carried onto `HubLead` from the live feed). Optimistic local
  echo shows the outbound bubble at once; demo rows have no `contactId`, so the send is a
  local echo only.
- ✅ **Not a fit (off-ramp)** → new `POST /api/sales/leads/:id/stage` with `{status:"lost"}`.
  The endpoint keeps stage-name resolution server-side (it also accepts a `stageName` for a
  future manual Confirm). `useMoveSalesLeadStage` + an in-component status override flip the
  status pill immediately; demo mirrors it in `src/demo/handlers/actions.ts`.
## Wired 2026-07-05 (action-wiring plan, Phases 2-3)
- ✅ **Book in-person visit** (Forms/Chat) → real-slot picker (`SlotPickerModal`) on the
  "Home Estimate" calendar → `POST /api/appointments` (create) + `useMoveSalesLeadStage`
  to "Estimate Scheduled". Fully working (event-type calendar).
- ✅ **Book intro call** (Paid Ads) → same picker on the "Intro Call" calendar → create +
  stage move to "Intro Call Waiting Confirmation". Code-complete, but the Intro Call
  calendars are round-robin with ZERO team members, so the picker shows an honest "this
  calendar needs staff assigned" note until Jake assigns staff in GHL. See caveat below.
- ✅ **Schedule a callback** (Forms/Chat) → `DateTimeModal` → `POST /api/contacts/:id/tasks`
  (`useCreateTask`) with a due date. Sets the lead to "working".
- **Pause nurture**: intentionally NOT built. The numbered nurture workflows are all draft;
  the published `Appointment Booked` + `Stage Changed` workflows already handle the
  post-booking flow, so creating the appointment / moving the stage triggers Willis's own
  automation. No separate pause call.
- Appointment write shapes: see `jobs.md` spike results (same `/calendars/*` endpoints).

### Booking calendars (live, `calendars list`)
- Intro Call: `KZk4ow0opo9nLlq355Aw` · Intro Call 2nd Chance: `HjIiKtDpK1skDq6a1pL0`
- Home Estimate: `nHoNSfAklWggzVxdbhBJ` (event type, bookable) · FB Home Estimate: `Fx7Me1CETjlzJMFwgJF6`
- Resolved BY NAME per tenant server-side (`functions/api/lib/appointments.ts`), id fallback.
- **CAVEAT / Jake action item:** the Intro Call + Intro Call 2nd Chance calendars are
  round-robin with ZERO team members, so free-slots + create both 422 "The calendar doesn't
  have any team members associated." Assign staff to the Intro Call calendar(s) in GHL and
  "Book intro call" turns on. "Book in-person visit" (Home Estimate) works today.
- Location users (for assignment): jake hauck `OUpJAf0XAO55bWUsphVA`, Jayse Gehringer
  `V6JjfooNA1Q9IUq0e94l`, Joshua Willis `gPAE7hq51BOU9ueMFNuE`.
- Note: **Confirm** and **Log call outcome** from the plan's action table are not distinct
  buttons in the current NextStep UI (confirmation is automatic via the webhook), so they
  were not surfaced; the `stage` endpoint is ready for a Confirm if one is added.

## Data source(s) — GoHighLevel
- ❌ **Paid Ad's Pipeline** (`uz0fFxCgiwdXbg4Zmwkc`) — the Paid Ads tab leads + their stage. Map `pipelineStageId` → status. (See `paidAdsPipeline.ts` for the real stage map.)
- ❌ **Organic Pipeline** (`source = "Website Form"` / `"chat widget"`) — the Estimate Forms + Chat Widget tab leads.
- ❌ **Conversations / messages** (SMS + Email threads per contact) — powers the SMS/Email toggle + composer. One conversation per lead, never copied (same thread the Unified Inbox reads).
- ❌ **Follow-up automation state** — powers the per-lead follow-up tracker (which steps have sent, where the lead replied, the outcome chip) and the "New / Awaiting / Replied" derivation. **This is the piece with no clean source yet:** GHL workflow enrolment + step history per contact. Until it lands, the tracker runs on the demo `fu` field.

## Follow-up sequences (must match the live workflows)
The tracker steps in `leadsHub.ts` (`SEQ.ad`, `SEQ.form`) are **PLACEHOLDERS**. Confirm the real steps + timing against the live GHL workflows and update `SEQ`:
- **Paid Ads** — the SMS nurture on lead-form leads (worked to an intro call).
- **Estimate Forms** — the auto email + SMS sequence that fires on form submit.
- **Chat Widget** — no dedicated sequence yet (bucket only); add a `SEQ.chat` if one exists.

## Automations to honour (already reflected in the UI copy)
- A **reply pauses** the auto follow-ups (lead moves to "Needs a human").
- **Booking an intro call pauses** the nurture so the two automations never collide, then fires the confirm text.
- **Call confirmation is fully automatic** (confirm link logs it + flips the Google Calendar title via the existing confirmation webhook — see `gohighlevel-cli/docs/duplicate-intro-call-funnel.md`). It is a status in the tracker, not a manual button.

## Backend endpoints to build (Pages Functions)
- ❌ `GET /api/sales/leads` — merged leads across the two pipelines + source + status + latest message preview + follow-up state. Could extend the shared opportunities fetch with a source/pipeline filter.
- ❌ `GET /api/sales/leads/:contactId/conversation` — the SMS + Email threads for a lead.
- ❌ `POST /api/sales/leads/:id/send` — send an SMS / Email reply into the GHL conversation.
- ❌ `POST /api/sales/leads/:id/book-call` — book the intro call, **pause the nurture workflow**, fire the confirm SMS (Paid Ads).
- ❌ `POST /api/sales/leads/:id/schedule` — schedule a callback (Forms/Chat), pause follow-ups until the callback time.
- ❌ `POST /api/sales/leads/:id/outcome` — Not-a-fit / off-ramp stage writes.

## Auth / identity
- ⚠️ Session mode (live/test) + per-tenant GHL location token, injected server-side (same pattern as the rest of the client app).

## Secrets / env vars
- ✅ `GHL_LOCATION_ID` / `GHL_TOKEN` (+ `TEST_*`) exist; confirm scope covers Conversations (send) + Opportunities (stage write) + Workflows (pause/enrol).

## Webhooks
- ❌ Inbound message → refresh a thread when the lead replies.
- ❌ Meta Lead-Ads → GHL (stamps the source ad on Paid Ads leads).
- ❌ Appointment-confirmation webhook → flips "awaiting confirm" → "confirmed" (existing pattern).

## Persistence
- None beyond GHL. The pipeline + conversation are the source of truth; the UI is a lens.

## Per-action gating (flip on when its connection lands)
- Lead list + threads → the leads + conversations feeds.
- Send reply (SMS / Email) → `/send`.
- Next-step actions (Call now / Book intro call / Schedule / Book visit / Not a fit) → the matching endpoint above.
- All terminal actions currently show the gated toast ("turns on once your accounts and phone are connected").
