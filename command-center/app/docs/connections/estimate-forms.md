# Estimate Forms — connections backlog

What the Estimate Forms section needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

Route: `/sales/forms`. The Organic Pipeline, `source = "Website Form"`. A conversation inbox: list of submissions (left) + the selected lead's contact, action bar, SMS/Email threads and composer (right). Quotes are given on the phone, never over text, so the call flow is front-and-centre. The Chat Widget page (`/leads/chat`, planned) is the same surface with `source = "chat widget"`.

## Data source — GoHighLevel
- ❌ **Form submissions feed** (Organic Pipeline, `source = "Website Form"`) — powers the inbox list, contact header, status, and "submitted" timing. Replaces the hand-authored `ESTIMATE_LEADS` in `src/lib/estimateForms.ts`.
- ❌ **Conversations / messages** (SMS + Email threads per contact) — powers the SMS/Email panes and the composer. One conversation per lead, never copied (it is the same thread the Unified Inbox and other sales pages read).
- ❌ **Auto follow-up state** (the automation that fires email + SMS on submit) — powers the "New / Awaiting / Replied" status derivation and the `automation` tag on the first-touch message.
- ❌ **Pipeline stage write** — moving a lead (Book in-person visit → Estimate Scheduled; Job Booked → Job Booked) writes the one GHL opportunity's stage.

## AI — Claude (server-side only)
- ⚠️ Optional (v2): **suggested reply / summarise what they want** in the client's voice. Suggested model: Sonnet 5. Not in v1; quotes happen on the phone.

## Backend endpoints to build (Pages Functions, the bridge)
- ❌ `/api/forms/submissions` — list inbound estimate-form leads (filter `source`, status).
- ❌ `/api/forms/conversation/:contactId` — the SMS + Email threads for a lead.
- ❌ `/api/forms/send` — send an SMS / Email reply into the GHL conversation.
- ❌ `/api/forms/outcome` — log a call outcome + route (stage write, callback, in-person visit booking).

## Telephony (shared with the Call Console — see `sales-call-system.md` §5/§5b)
- ❌ **Outbound dial** — "Start call" / "Call now". Route 1 = `tel:` on mobile + GHL number; Route 2 (later) = Twilio WebRTC softphone.
- ❌ **Call outcome logging** — Job Booked (with price) / Follow up (callback time) / Couldn't reach → stage + Today.
- ❌ **Schedule a call / Book in-person visit** — calendar write (callback slot / Estimate Scheduled appointment).

## Auth / identity
- ✅ Session model exists (live/test). The Worker injects the active mode's GHL location + token per request — extend the same pattern to the forms endpoints.

## Secrets / env vars (Cloudflare Pages)
- ✅ `GHL_LOCATION_ID` / `GHL_TOKEN` (+ `TEST_*`) — exist; confirm the token scope covers Conversations (SMS/Email send) + Opportunities (stage write).
- ❌ Telephony creds — only for Route 2 (own Twilio voice layer); not needed for Route 1.

## Webhooks
- ❌ **Inbound message** — refresh a thread when the lead replies (vs polling).
- ❌ **Inbound call** — fires the Call Console screen-pop / push (timing TBD: call-start vs call-end — see `sales-call-system.md` §7).

## Persistence
- None beyond GHL. The conversation and the opportunity are the source of truth; the UI is a lens.

## Per-action gating (flip on when its connection lands)
- Inbox list + threads → forms submissions + conversations feed.
- Send reply (SMS / Email) → `/api/forms/send`.
- Start call / Job Booked / Follow up / Couldn't reach → telephony + `/api/forms/outcome`.
- Schedule a call / Book in-person visit → calendar write.
- All terminal actions currently show the gated toast ("turns on once your phone and website forms are connected").
