# Unified Inbox — connections backlog

What the Unified Inbox needs to go from demo-complete to fully functional. Status: ❌ not wired · ⚠️ partial · ✅ live.

Route: `/conversations` (sidebar label "Inbox"). Desktop renders a three-pane layout: a Channel + Source filter rail (left), the conversation list with a source badge per row (middle), and an inline detail pane with an origin-context strip, message thread, and composer (right). The phone keeps its single-column list and gains the same source badge.

## Data source — GoHighLevel
- ✅ **Conversations feed** (`/conversations/search`, paginated via `fetchAllConversations`) — powers the list, previews, unread counts, and the `channel` (from `lastMessageType`).
- ⚠️ **Contact roster join** (`/contacts`, paginated via `fetchAllContacts`) — powers the **Source** rail and origin strip. The endpoint now fetches all contacts in parallel and joins `source` + `tags` + `dateAdded` per conversation. Partial because origin is then derived by a heuristic (see below), not read from a clean attribution field.
- ❌ **Inbound-message webhook** — refresh a thread live when a lead replies (vs the current poll on query refetch). Shared with the Estimate Forms surface (`estimate-forms.md`).

## Origin classification (heuristic, correct it here)
- ⚠️ `functions/lib/origin.ts` → `classifyOrigin(source, tags)`. Ordered regex rules, first match wins, over the lowercased `source + tags` string. Categories: `form`, `chat`, `paid`, `react`, `call`, `social`, `other`.
- **Known ambiguity:** a lead whose GHL `source` is literally `"Facebook"` or `"Instagram"` is classified `social`, not `paid`, because the source string alone cannot tell a paid-ad lead from an organic DM. To resolve, wire UTM / attribution (below) and prefer it over the bare source string.
- **To correct per client:** edit `ORIGIN_RULES` in `functions/lib/origin.ts`. The display labels / colors live in `src/lib/inboxFilters.ts` (`ORIGINS`). Keep the `OriginKey` / `ChannelKey` unions in those two files in sync.

## Attribution upgrade (resolves the paid-vs-social ambiguity)
- ❌ **UTM / attribution read** — `attributionFromCustomFields` + `customFieldKeyMap` already exist in `functions/lib/ghl.ts` (used by the single-lead endpoint). Extend the conversations join to read `utm_source` / `utm_campaign` per contact and let a present UTM campaign force `origin = "paid"` ahead of the `social` rule. Costs one custom-field map fetch per location (already cached an hour).

## AI — Claude (server-side only)
- ⚠️ Optional (v2): **suggested reply** in the client's voice from the detail pane. Suggested model: Sonnet 5. Not in v1.

## Backend endpoints
- ✅ `GET /api/conversations` — list, now enriched with `channel`, `origin`, `source`, `firstTouchAt`.
- ✅ `GET /api/conversations/:contactId/messages` — the thread for the inline detail pane (reused by the phone + the old desktop detail route).
- ✅ `POST /api/conversations/:contactId/send` — channel-aware reply from the composer.
- ❌ `GET /api/contacts` performance — the inbox now fetches the full contact roster on every conversations load. Fine at Willis scale (hundreds); add a short-TTL cache or a server-side join if a location grows into thousands of contacts.

## Auth / identity
- ✅ Session model (live/test). The Worker injects the active mode's GHL location + token per request; the conversations + contacts fetches both use it.

## Secrets / env vars (Cloudflare Pages)
- ✅ `GHL_LOCATION_ID` / `GHL_TOKEN` (+ `TEST_*`) — exist; token scope already covers Conversations + Contacts.

## Persistence
- None beyond GHL. The conversation + contact records are the source of truth; the inbox is a lens. Filter selections (channel / source) are component state, not persisted.

## Per-action gating (flip on when its connection lands)
- List + channel filter → live now (conversations feed).
- Source filter + origin strip → live but heuristic; accuracy improves when the attribution upgrade lands.
- Inline thread + send → live (conversation messages + send).
- Live refresh on inbound reply → inbound-message webhook.

## Demo / test mode
- ✅ `src/demo/data.ts` seeds varied `channel` + `origin` across demo conversations so both rails show spread without a live GHL connection.
