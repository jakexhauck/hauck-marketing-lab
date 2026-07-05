# Inbox — Implementation Plan

> **For agentic workers:** execute task-by-task. Read `00-README.md` for shared ground rules (app location, run/verify commands, no-em-dash + never-name-GHL rules, data contract). Self-contained otherwise.

**Goal:** Split the single unified inbox into two pages, **SMS** and **Email**, each structured like the other section pages. Restrict the inbox to SMS + email only (drop Instagram DM and Messenger). Keep "chat widget" as a source category but not as its own conversation type. Surface the lead source explicitly on every conversation, and show a disclaimer when the same contact is reached over both SMS and email. Remove the header subtitles.

**Scope:** Pages-first. UI restructure over existing real data (`/api/conversations`). No automations. Sending stays exactly as wired today, just channel-scoped per page.

## Current state (audited)
- Routes: `src/App.tsx:336-350` — `/conversations` (list), `/conversations/:contactId` (detail).
- Mobile list: `src/routes/Conversations.tsx` (title "Chats" :100; subtitle :102-106; empty state :144-147; rows render `SourceBadge` + a channel badge :202-207; `channelLabel` :41-56).
- Desktop list: `src/components/conversations/ConversationsDesktop.tsx` (title "Inbox" :144; smart-view pills :97-115 = Needs reply / All / one pill per channel with traffic; `CHANNELS` + accent colors :31-37; subtitle :136-138).
- Detail: `src/routes/ConversationDetail.tsx` (subtitle "Conversation" :76); desktop `src/components/conversations/ConversationDetailDesktop.tsx`.
- Thread + composer: `src/components/ConversationThread.tsx` (`activeChannel` filters visible messages by channel, :90,120), `src/components/MessageComposer.tsx`, `src/components/ChannelComposer.tsx` (channel chips :13-22).
- Classifier (keep in sync, two mirrored copies): `src/lib/inboxFilters.ts` (`ORIGINS` :27-35 = form/chat/paid/react/call/social/other; `CHANNELS` :37-43 = sms/email/ig/messenger/other; `normalizeChannel`) and server `functions/lib/origin.ts`.
- Source badge: `src/components/conversations/SourceBadge.tsx`.
- Data: `GET /api/conversations` (server-classified with `channel` + `origin`), `GET /api/conversations/{contactId}/messages`, `POST .../send`.

## Target structure
Inbox section with two pages: **SMS** and **Email**. Each page is a standard `PageBar` page listing only that channel's conversations, filterable by lead source. Detail view opens the thread scoped to that channel. IG/Messenger removed from the inbox entirely.

---

### Task 1: Restrict channels to SMS + email; drop IG and Messenger (doc #7) — testable
**Files:** `src/lib/inboxFilters.ts` (`CHANNELS` :37-43, `normalizeChannel`), `functions/lib/origin.ts` (mirror), and the matching test file (search `src/lib/*inbox*` / `*origin*` tests; if none, create `src/lib/inboxFilters.test.ts`).
- [ ] Write/adjust tests first: `normalizeChannel` maps IG and Messenger inputs to a value the inbox does NOT surface (fold to `other` or exclude), and only `sms` + `email` are treated as first-class inbox channels.
- [ ] Run the test, watch it fail.
- [ ] Update `CHANNELS` and `normalizeChannel` in both `inboxFilters.ts` and `origin.ts` (keep the two copies identical) so IG/Messenger are not presented as inbox channels.
- [ ] Update the conversations list fetch/render so IG- and Messenger-only conversations are filtered out of the inbox.
- [ ] Run tests: green. `npm run typecheck`.
- [ ] Commit: `feat(inbox): restrict inbox to SMS and email channels`.

### Task 2: Add SMS and Email sub-pages (doc #2) 
**Files:** `src/lib/pageTabs.ts` (add `INBOX_TABS` + wire into `sectionLabel()`), `src/lib/nav.test.ts`, `src/App.tsx:336-350`, `src/lib/nav.ts` (the Inbox row), `src/routes/Conversations.tsx`, `src/components/conversations/ConversationsDesktop.tsx`.
- [ ] Add `INBOX_TABS` with two tabs: `SMS` (route `/conversations/sms`) and `Email` (route `/conversations/email`). Add routes in `App.tsx`; redirect `/conversations` → `/conversations/sms`.
- [ ] Render the Inbox list inside a `PageBar` with these tabs, matching how the marketing sections look (section title "Inbox").
- [ ] The list is filtered to the active channel: SMS page shows `channel === 'sms'`, Email page shows `channel === 'email'`.
- [ ] Update `nav.ts` if the Inbox row's target needs to point at `/conversations/sms`, and update `nav.test.ts`.
- [ ] `npm run typecheck` + `npm test` + walk `?demo=1`.
- [ ] Commit: `feat(inbox): split inbox into SMS and Email pages`.

### Task 3: Scope the conversation detail + composer to the page's channel (doc #2, #6)
**Files:** `src/routes/ConversationDetail.tsx`, `src/components/conversations/ConversationDetailDesktop.tsx`, `src/components/ConversationThread.tsx`, `src/components/ChannelComposer.tsx`.
- [ ] When a conversation is opened from the SMS page, the thread and composer default to SMS; from the Email page, to Email. (Reuse `activeChannel`; set the default from the page channel instead of the last message.)
- [ ] Chat-widget messages are not a separate channel: replies to a chat-widget lead go out over SMS or email like any other conversation (doc #6). Ensure no "chat" channel/composer option remains.
- [ ] `npm run typecheck` + walk `?demo=1`: open a conversation from each page, confirm the composer channel.
- [ ] Commit: `feat(inbox): scope conversation detail and composer to the page channel`.

### Task 4: Surface the lead source explicitly on every conversation (doc #5)
Categories to show: Paid Ad, Estimate Form, Chat Widget (later: Facebook Group, Commercial Outreach). The origin classifier already produces these (`inboxFilters.ts:27-35`).
**Files:** `src/routes/Conversations.tsx`, `src/components/conversations/ConversationsDesktop.tsx`, `src/components/conversations/SourceBadge.tsx`.
- [ ] Show the `SourceBadge` (origin) prominently on every conversation row and in the detail header, with clear labels (Paid Ad / Estimate Form / Chat Widget / Reactivation / Inbound Call / Other). Customer language only.
- [ ] Replace the desktop per-channel smart pills (`ConversationsDesktop.tsx:97-115`) with **source-category filter pills** within the current channel page (Needs reply / All / Paid Ad / Estimate Form / Chat Widget / ...). Keep "Needs reply" (longest-wait-first) and "All".
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(inbox): explicit lead-source categories and filters per page`.

### Task 5: Same-contact-across-both-channels disclaimer (doc #3)
**Files:** `src/routes/ConversationDetail.tsx`, `src/components/conversations/ConversationDetailDesktop.tsx` (and a small helper to detect the same contact on the other channel from the conversations list).
- [ ] When the open contact also has messages on the other channel (SMS while viewing Email, or vice versa), show a clear inline note, e.g. "You're also talking to this person over SMS", with a link to the same contact on the other page.
- [ ] Only show it when the other-channel conversation actually exists (no fabricated state).
- [ ] `npm run typecheck` + walk `?demo=1` (demo can seed a contact on both channels).
- [ ] Commit: `feat(inbox): disclaimer when a contact is reached over both SMS and email`.

### Task 6: Remove the header subtitles (doc #1)
**Files:** `src/routes/Conversations.tsx:102-106`, `src/components/conversations/ConversationsDesktop.tsx:136-138`, `src/routes/ConversationDetail.tsx:76`.
- [ ] Remove the list subtitle ("N threads, N unread" / "N conversations, N waiting on you") and the detail "Conversation" subtitle so no description renders under the header. (Keep unread counts if they live elsewhere as a badge; only the header description line goes.)
- [ ] `npm run typecheck` + walk `?demo=1`.
- [ ] Commit: `feat(inbox): remove header subtitles`.

## Verify (whole plan)
- `npm run typecheck`, `npm test`, `npm run build` clean.
- Walk `/conversations/sms` and `/conversations/email` at `?demo=1`: source badges, filters, both-channel disclaimer, no IG/Messenger, no "chat" channel.
- Report what needs a real Willis session (channel classification on real conversations).

## Note on doc #4 ("integrate leads into the inbox")
The Leads pipeline restructure is deferred (see `08-leads-cleanup.md`). Leads conversations already flow through the same `/api/conversations` data and now carry explicit source categories in the inbox, which is the client-facing half of that integration. The deeper leads/inbox merge is revisited when the Leads pipelines are rebuilt in the automation phase.
