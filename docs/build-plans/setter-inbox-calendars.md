# Setter Suite: full inbox and all calendars

Spec and implementation plan in one document.

## What this is

Setters currently work a client's leads from a board and a cockpit. They can log a dial, apply tags, and book into exactly one calendar resolved by name. They cannot see a word the customer has said.

This adds two things:

1. **The client's whole inbox**, readable and replyable, as a tab inside the Setter Suite.
2. **All of the client's calendars**, so booking is not pinned to a single hardcoded name.

## Why

A setter with someone on the phone needs the conversation history to know what was already promised, and needs the right calendar to book into. Today they have neither, so the Suite cannot actually replace working the lead inside the booking system.

## Decisions locked

Answered by Jake on 2026-07-21:

| Question | Decision |
|---|---|
| Send or read-only | **Full send**, SMS and email, no approval step |
| Inbox scope | **Everything**, the client's whole inbox, not just pipeline contacts |
| Calendars | **Book into any calendar**. No schedule view, no reschedule or cancel |
| Placement | **Tab inside the Setter Suite**, sharing one client picker |

Two additions Jake approved when the design was presented:

- **Build the admin audit viewer in the same pass.** Full send with no approval and no per-setter accounts means the audit log is the only record of who messaged whom. `admin_audit_log` has been written to since migration 0008 but has never had a reader, so today the record exists and nobody can see it.
- **Keep inbox data out of the persisted cache.** The Suite already had a deferred finding about customer PII sitting in localStorage for 24 hours. Extending that to whole conversation histories would leave a client's customer correspondence on disk on any machine a setter uses.

## Constraints that must not be broken

1. **Never fall back to env GHL credentials.** Every endpoint resolves creds through `getGhlContextForTenant` in `functions/lib/tenantGhl.ts`, which hard-fails on the placeholders `''`, `pending` and `env`. The older `resolveGhlCreds` in `tenantResolve.ts` falls back to `env.GHL_LOCATION_ID` and `env.GHL_TOKEN`, which are Willis production credentials. On a cross-client screen that fallback would let a setter message Willis's real customers while believing they were on the test account. Do not unify these two functions.
2. **Every write is audited.** `book.ts`, `dials.ts` and `tags.ts` already call `logAdminAction`. The send endpoint must too, and must record the channel, the contact, and the message body.
3. **The client app does not change.** It stays read-only and untouched, as it has through every step of this build.
4. **Admin gate on everything.** All new endpoints live under `functions/api/admin/` and return 401 unauthenticated.

## What already exists and gets reused

Nothing here needs a new GHL integration. The pieces are in the tree:

| Need | Existing code |
|---|---|
| Channel-aware send, SMS and email | `sendChannelMessage`, `functions/lib/messaging.ts` |
| Fetch one contact's thread | `fetchContactThread`, same file |
| Normalize GHL message types | `normalizeMessageType`, same file |
| List a location's conversations | `fetchAllConversations`, `functions/lib/ghl.ts` |
| List calendars, free slots, create appointment | `functions/api/lib/appointments.ts` |
| Safe per-tenant GHL creds | `getGhlContextForTenant`, `functions/lib/tenantGhl.ts` |
| Audit trail | `logAdminAction`, `functions/lib/adminAuth.ts` |
| Cache exclusion by query key | `shouldPersistQuery` and `NEVER_PERSIST_KEYS`, `src/lib/queryClient.ts` |

One API quirk, and it is narrower than it looks. Free-slots and appointment-create need `Version: 2021-04-15`, not the `2021-07-28` used everywhere else, and go through the private `calFetch` helper. The calendar **list** tolerates the default version and uses plain `ghlJson`. Both are already handled inside `appointments.ts` and neither should leak out of it.

## API contracts

### GET /api/admin/setter/calendars?tenantId=

Lists the client's active calendars.

```
200 { calendars: [ { id, name, isActive } ] }
400 { error: "missing_tenant_id" }
401 unauthenticated
502 { error: "ghl_unavailable" }
```

Only `isActive !== false` calendars are returned, matching what `appointments.ts` already filters. Event-type calendars are the only ones that support free slots and appointment creation; a calendar that returns no slots surfaces the existing `needsStaff` signal rather than an empty dropdown with no explanation.

### GET /api/admin/setter/inbox?tenantId=&q=&limit=&cursor=

Thread list for the whole location.

```
200 { threads: [ { contactId, name, preview, lastMessageAt, lastMessageType, unreadCount } ], nextCursor }
```

`limit` defaults to 50 and caps at 100. A client with thousands of threads must not be fetched in one request; this is why the endpoint pages rather than reusing the client app's fetch-everything shape. `q` filters by contact name or phone, applied server-side so the setter is not searching only the page they happen to have.

### GET /api/admin/setter/inbox/[contactId]?tenantId=

One thread, newest last.

```
200 { contactId, name, messages: [ { id, direction, channel, body, sentAt } ] }
404 { error: "contact_not_found" }
```

### POST /api/admin/setter/inbox/[contactId]

Send as the client.

```
body { tenantId, channel, body, subject? }
200  { sent: true, messageId }
400  { error: "invalid_channel" | "missing_body" | "missing_subject" }
502  { error: "send_failed" }
```

`subject` is required when `channel` is `Email`, enforced by `sendChannelMessage` already. Writes an `admin_audit_log` row with action `setter.send` and a payload carrying tenant, contact, channel and body.

### Changed: slots.ts and book.ts

Both currently take `calendarName` and call `resolveCalendarByName`. Both switch to taking `calendarId` directly, because the UI now picks from a real list and a name lookup in the middle is a lossy round trip. This is a breaking change to two live endpoints, which is acceptable only because the Suite shipped empty and has no other callers. `resolveCalendarByName` stays in `appointments.ts`; it is still used elsewhere and removing it is out of scope.

## Tasks

Ordered. Each task is independently verifiable and leaves the tree green.

### Task 1: calendars endpoint

- **New** `functions/api/admin/setter/calendars.ts`
- **New** `functions/api/admin/setter/calendars.test.ts`

Admin-gated GET, resolves creds via `getGhlContextForTenant`.

The listing is currently **inline inside `resolveCalendarByName`** (it fetches `/calendars/?locationId=`, filters `isActive !== false`, then name-matches). So the first move is to extract that fetch-and-filter into an exported `listCalendars(gctx)` in `appointments.ts`, and have `resolveCalendarByName` call it. The `Calendar` interface needs exporting too. This is extraction, not new behaviour: `resolveCalendarByName` must behave identically afterwards, which its existing tests should prove.

The new endpoint then just calls `listCalendars`.

Verify: unit tests cover missing tenantId, placeholder creds rejected, active-only filtering, and GHL failure mapping to 502.

### Task 2: slots and book take calendarId

- **Modify** `functions/api/admin/setter/slots.ts`
- **Modify** `functions/api/admin/setter/book.ts`
- **Modify** `functions/api/admin/setter/slots.test.ts`
- **Modify** `functions/api/admin/setter/book.test.ts`

Replace the `calendarName` parameter with `calendarId`. Drop the `resolveCalendarByName` call from both. Keep the `calendar_not_found` response for an id GHL rejects.

Verify: existing tests updated and green. The `missing_calendar_name` error code becomes `missing_calendar_id`; grep for the old code so no caller or test still expects it.

### Task 3: calendar picker in the booking flow

- **Modify** `src/components/admin/setter/SlotPicker.tsx`
- **Modify** `src/lib/api.ts` and `src/hooks/useApi.ts` for the calendars query

The picker gains a calendar dropdown above the slot grid. Selecting a calendar refetches slots for that calendar. The prior review found SlotPicker firing two live CRM calls per keystroke; the calendar select must not reintroduce that, so slots fetch on calendar change only, never on render.

Verify: manual check that changing calendar triggers exactly one slots request.

### Task 4: inbox list endpoint

- **New** `functions/api/admin/setter/inbox/index.ts`
- **New** `functions/api/admin/setter/inbox/index.test.ts`

Paged thread list per the contract above. Reuses `fetchAllConversations` but must not return an unbounded list; page it.

Verify: tests cover paging, the limit cap, search filtering, and placeholder creds rejected.

### Task 5: thread read and send

- **New** `functions/api/admin/setter/inbox/[contactId].ts`
- **New** `functions/api/admin/setter/inbox/[contactId].test.ts`

GET reuses `fetchContactThread`. POST reuses `sendChannelMessage` and then calls `logAdminAction` with action `setter.send`.

Verify: tests cover the email-without-subject rejection, invalid channel, a successful send writing an audit row, and that a failed send does NOT write one.

### Task 6: keep inbox out of the persisted cache

- **Modify** `src/lib/queryClient.ts`

Add the inbox query key stem to `NEVER_PERSIST_KEYS` alongside `preview-token`, and bump `PERSIST_CACHE_BUSTER` so existing snapshots are discarded rather than rehydrated.

Verify: a unit test asserting `shouldPersistQuery` returns false for an inbox key and true for an ordinary one.

### Task 7: Board / Inbox tab shell

- **Modify** `src/routes/admin/SetterSuite.tsx`

Add a two-tab switcher below the existing client picker. The client selector stays above the tabs so it drives both. Tab choice persists per session the way the Jobs view switcher does.

Verify: switching clients while on Inbox keeps you on Inbox with the new client's threads.

### Task 8: inbox UI

- **New** `src/components/admin/setter/SetterInbox.tsx`
- **New** `src/components/admin/setter/ThreadList.tsx`
- **New** `src/components/admin/setter/ThreadView.tsx`
- **New** `src/components/admin/setter/Composer.tsx`

Thread list left, conversation and composer right. The composer picks a channel, and requires a subject when the channel is Email. A send failure must surface as a toast and leave the typed body in the box; silently losing a setter's message is worse than the send failing.

Follow the project convention: no component tests, logic that needs testing lives in a `src/lib/*.ts` module with its own test.

Verify: send failure keeps the draft, empty inbox shows a real empty state and not a spinner forever.

### Task 9: admin audit viewer

- **New** `src/routes/admin/AdminAudit.tsx`
- **New** `functions/api/admin/audit.ts` and its test
- **Modify** `src/App.tsx` for the route

A paged, filterable table over `admin_audit_log`: when, which admin, which action, which tenant, and the payload. Filter by tenant and by action so `setter.send` can be isolated.

Reachable from Settings rather than the sidebar; it is an occasional-use surface, not a daily one, and the sidebar zones were just settled.

Verify: rows appear for a real send performed in Task 5, and the endpoint 401s unauthenticated.

### Task 10: ship

Full suite green, typecheck clean, build clean. Push, watch the deploy, poll the served bundle for a distinctive string rather than the local hash, since Cloudflare builds its own. Smoke test that every new endpoint 401s unauthenticated and the route serves 200.

Then: delete this plan document in the ship commit, and append Jake's action items to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`.

## What this does not do

Named deliberately so nobody assumes otherwise later:

- **No schedule view.** Setters can book into any calendar but cannot see what is already on it.
- **No reschedule or cancel.** `rescheduleAppointment` exists in the lib and stays unused.
- **No per-setter accounts.** Every action is attributed to whichever admin account is signed in. When Jake hires setters, the audit trail says "an admin did this", not which one. That is a known limitation of shipping before accounts exist, and the audit viewer is what makes it visible.
- **No realtime.** The inbox polls on the existing query cadence. A reply landing while a setter reads the thread appears on the next refetch, not instantly.

## Risk

The blast radius is the point worth restating. A signed-in admin can message a client's entire customer base under that client's name, with no undo and no approval step, and the recipient cannot tell the message came from Hauck Marketing rather than the client. Today the only person with that power is Jake. The audit viewer in Task 9 is what keeps it accountable the day that stops being true.
