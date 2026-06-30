# Chat Widget — connections backlog

What the Chat Widget section needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

Route: `/sales/chat`. The Organic Pipeline, `source = "chat widget"`. The **same surface as Estimate Forms** — the shared `ConversationInbox` (`src/components/sales/ConversationInbox.tsx`) with chat-flavoured copy + the chat dataset. A conversation inbox: list of chat leads (left) + the selected lead's contact, action bar, SMS/Email threads and composer (right). Leads start in the website chat bubble; the live chat continues over SMS once the visitor leaves a number. Quotes are given on the phone, never over text, so the call flow is front-and-centre.

Because it shares the surface, **anything wired for Estimate Forms applies here by changing the `source` filter** — there is no separate UI to connect. See `estimate-forms.md`; the deltas are below.

## Data source — GoHighLevel
- ❌ **Chat-widget leads feed** (Organic Pipeline, `source = "chat widget"`) — powers the inbox list, contact header, status, and timing. Replaces the hand-authored `CHAT_LEADS` in `src/lib/chatWidget.ts`. Same endpoint as forms, filtered by source.
- ❌ **Conversations / messages** (SMS + Email threads per contact) — the same one-conversation-per-lead thread the Unified Inbox and other sales pages read. The first-touch is the auto follow-up that fires once the visitor leaves a number in the chat.
- ❌ **Auto follow-up state** — powers the "New / Awaiting / Replied" status and the `automation` tag on the first-touch message.
- ❌ **Pipeline stage write** — Book in-person visit → Estimate Scheduled; Job Booked → Job Booked, on the one GHL opportunity.

## Backend endpoints (shared with Estimate Forms — the bridge)
- ❌ `/api/forms/submissions?source=chat-widget` — list inbound chat leads (same handler as forms, `source` filter).
- ❌ `/api/forms/conversation/:contactId` — the SMS + Email threads for a lead (shared).
- ❌ `/api/forms/send` — send an SMS / Email reply into the GHL conversation (shared).
- ❌ `/api/forms/outcome` — log a call outcome + route (stage write, callback, in-person visit booking) (shared).

## Telephony (shared with the Call Console — see `sales-call-system.md` §5/§5b)
- ❌ Outbound dial, call-outcome logging, schedule-a-call / book-in-person — all shared with Estimate Forms.

## Per-action gating (flip on when its connection lands)
- Same as Estimate Forms. All terminal actions currently show the gated toast ("This turns on once your chat widget and phone are connected").

## Notes
- No GHL chat feed is wired yet, so a real session shows the empty, not-connected state; the populated inbox is demo/preview (`?demo=1`) only — same golden rule as every other surface.
