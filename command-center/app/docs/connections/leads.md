# Leads — connections backlog

The merged **Leads** surface (`/sales/leads`): Paid Ads + Estimate Forms + Chat Widget on one page, three in-line source tabs. Replaces the old Sales "Channels" group (the per-channel routes `/sales/paid-ads`, `/sales/forms`, `/sales/chat` still resolve for deep links but are out of the sidebar).

Ships **demo-complete but not connected**: a real session renders the empty/not-connected state, and every terminal action is gated until the feeds land. Status: ❌ not wired · ⚠️ partial · ✅ live.

Reads its data through `useLeadsHub()` → `buildLeadsHub()` in `src/lib/leadsHub.ts` (hand-authored demo worklist today; empty in a real session). Keep this return shape when wiring live and nothing downstream changes.

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
