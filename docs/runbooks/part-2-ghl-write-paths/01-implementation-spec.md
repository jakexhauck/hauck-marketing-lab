# Part 2 Implementation Spec (Claude executes this)

No manual actions in this file. Each numbered item maps to the finding numbers in [00-README.md](00-README.md).

## 2.1 + 2.12 Won note goes to the contact, with neutral copy

In `functions/api/leads/[id].ts`:
- The opportunity is already fetched in this handler; it carries `contact.id` / `contactId`. After a successful status change to won, POST the note to `/contacts/{contactId}/notes` (the real v2 endpoint) instead of `/opportunities/{id}/notes`.
- Check the response: log a warning with status code on failure instead of fire-and-forget.
- Copy changes to: `Marked won in the dashboard. Value: $<amount>.` No agency branding in client CRM data. If no value, omit the value sentence.
- If the opportunity has no resolvable contactId, skip the note and log; never fail the win itself.

## 2.2 Lead notes become contact notes

- Remove `notes` from the `PUT /opportunities/{id}` body mapping and from the opportunity response mapping in `functions/lib/ghl.ts` (it is not a real v2 field; reading it always yields null).
- The app's "add note to lead" feature (`LeadsContext.updateLead({notes})` path) is rerouted: the PATCH handler, when it receives `notes`, creates a contact note via `POST /contacts/{contactId}/notes` using the opportunity's contact id.
- Frontend: LeadDetail already has a contact-notes section driven by `useContactNotes`; the lead-level notes field in the UI is removed or pointed at the same contact-notes list so there is exactly one notes concept. Choose whichever keeps the UI simplest; document the choice in the Part 2 report.

## 2.3 Tasks API conformance

In `functions/api/contacts/[contactId]/tasks.ts` (create):
- Always send `completed: false` on create.
- Validate `title` is a non-empty string (400 otherwise).

In `tasks/[taskId].ts` (update):
- Fetch-merge semantics: GET the task first, merge the incoming partial onto it, always send `title`, `dueDate`, and `completed` in the PUT. This removes the "update without dueDate 4xxs" hazard.
- Guard `body` against null/non-string before `.trim()`.

## 2.4 Message type normalization

New helper in `functions/lib/messaging.ts`:

```
function normalizeMessageType(m: { type?: unknown; messageType?: unknown }): string
```

- Prefer `messageType` when it is a string (`TYPE_SMS` etc.).
- Fall back to `type` only when it is a string.
- Numeric `type` maps through the documented numeric table (1 SMS, 3 Email, etc.) where known; otherwise empty string.
- All three call sites (`conversations/[contactId]/messages.ts`, `leads/[id]/messages.ts`, `messaging.ts` channel inference) use the helper; no raw `.toUpperCase()` on unknown values anywhere.

## 2.5 Rep lead filtering

In `src/context/LeadsContext.tsx` `adaptApiLead`:
- Stop hardcoding `assignedUserId: null`; map it from the API lead.
- In `src/lib/api.ts`, add `assignedTo?: string | null` to `ApiLead` (the backend already returns `assignedUserId` from `opportunity.assignedTo`; confirm the actual field name the backend emits and align).
- Verify Today.tsx and Dashboard.tsx filters now operate on real ids.

## 2.6 Thread pagination

In both messages endpoints:
- Request `limit=100`.
- Follow `lastMessageId` / `nextPage` cursors up to 5 pages (500 messages), newest first preserved.
- Return a `truncated: true` flag when the cap is hit so the UI can someday show "older messages in GHL".

## 2.7 Conversations list pagination

In `functions/api/conversations/index.ts`:
- Drop the dead `startAfterId`/`nextPageUrl` cursor probing.
- Implement the endpoint's actual mechanism: pass `startAfterDate` derived from the last conversation's sort key, loop to the existing 10-page cap.
- Keep the existing response shape.

## 2.8 Multiple conversations per contact

In the per-contact thread endpoints:
- Search returns all conversations for the contact; instead of `[0]`, pick the one with the most recent `lastMessageDate`, and merge unread counts.
- Sends continue through `POST /conversations/messages` keyed by contactId (GHL threads it server-side), so no change needed on send; document this in code.

## 2.9 Safer retries

In `functions/lib/ghl.ts`:
- Only retry idempotent methods (GET/HEAD) on 5xx.
- On 429: respect `Retry-After` if present (cap 2s), retry once, GET-only.
- Non-GET 5xx/429 surfaces as an error immediately; no duplicate sends.

## 2.10 Monetary value semantics

- `value: null` no longer maps to `monetaryValue: 0`; null means "do not touch the field". Clearing to zero requires an explicit `0`.

## 2.11 Body parsing

- The 5 routes using bare `ctx.request.json()` get the same try/catch-400 treatment login.ts uses.

## Anything else found while in these files

Per standing instructions: fix it, and list it in the report under "extras".

## Exit criteria

- `pnpm typecheck` and `pnpm build` pass.
- Report to Jake with file-by-file summary before he runs [02-manual-actions.md](02-manual-actions.md).
