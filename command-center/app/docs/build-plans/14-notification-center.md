# 14: Notification Center (in-app activity feed + bell)

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Add an in-app notification center: a bell with an unread badge and a feed of recent activity
(new lead, new inbound message, appointment booked, invoice paid, stage change). This is the
screen-resident counterpart to push (06): push taps the user on the shoulder; the center is where
they see what they missed.

## Why it matters

Every prior feature generates events worth knowing about. Without a place to see them, the client
relies on opening each section to discover what changed. A notification center is what makes the
app feel alive and is the single strongest reason to open it daily. It is intentionally last: it
aggregates events the other features produce, so building it before them would mean a feed with
nothing to show.

## Dependencies

- **05 (webhook processing)** is the source of events. The webhook must write to an activity store
  (the `activity_log` table referenced in 05) for the feed to read.
- **03 (Supabase wiring)** provides that store and the read client.
- **06 (push notifications)** is the delivery transport for the same events; the center and push
  should share one event definition so a pushed event and a feed item are the same record.
- This doc assumes 03, 05, and 06 are done. If they are not, build those first.

## Current state

`functions/api/webhook.ts` exists and (per 05) logs or will log events. There is no notification
center, no bell, no unread state. GHL has **no general "notifications" read endpoint** for this:
the in-app feed is built from our own activity store fed by GHL webhooks, not from a GHL pull.
That is the key architectural point and the reason this depends on 05, not on a new GHL endpoint.

## Target state

- The webhook (05) classifies each GHL event into a small typed set and writes an `activity_log`
  row: `{ id, tenant, type, title, body, contactId, entityId, createdAt, readAt }`.
- `functions/api/notifications/index.ts`: `GET` returns recent activity newest-first with an
  unread count; `POST /read` marks one or all read.
- A `<NotificationBell>` in the app header with an unread badge, opening a `Notifications.tsx`
  feed. Tapping an item deep-links to the relevant screen (lead, conversation, appointment,
  invoice).

GHL webhook event types worth surfacing (confirm the exact names against the test account's
webhook payloads): `ContactCreate`, `OpportunityCreate`, `OpportunityStageUpdate`,
`OpportunityStatusUpdate`, `InboundMessage`, `AppointmentCreate`, `InvoicePaid`.

## Step-by-step

### 1. Define the event taxonomy (shared with 06)

A single `NotificationType` enum used by both the webhook writer and the push sender, so a feed
item and a push are one concept. Map each GHL webhook type to one `NotificationType` plus a
human title/body template (no em dashes in templates).

### 2. Webhook writes activity rows

Extend `functions/api/webhook.ts` (the 05 work) so each handled event inserts an `activity_log`
row for the tenant, in addition to whatever 05 already does (cache invalidation, push trigger).
Deduplicate on the GHL event id so a redelivered webhook does not double-post.

### 3. Notifications read/mark route

`functions/api/notifications/index.ts`: `onRequestGet` returns the latest N rows for
`ctx.data.tenant` newest-first plus `unreadCount`. A `read` action (sub-route or query flag) sets
`readAt` for one id or all. Reads come from Supabase via the 03 client.

### 4. Bell + feed UI

`<NotificationBell>` in `AppHeader`/`TopBar` with an unread badge. `Notifications.tsx` feed:
grouped by day, each item with an icon per type, title, relative time, and unread styling.
Tapping marks read and routes to the entity (`/leads/:id`, `/conversations/:contactId`,
calendar, billing). Poll the unread count on an interval, or refresh it on the same trigger the
push service worker already uses, so the badge stays current without a heavy poll.

### 5. Reconcile with push (06)

When 06 sends a push for an event, the same event must already be (or also be) an `activity_log`
row, so opening the app from a push lands on a feed that contains it. Drive both from step 2's
write, not from two separate code paths.

## Testing

1. Trigger each event type in the test account (create a contact, send an inbound message, book an
   appointment, mark an invoice paid). Confirm one `activity_log` row each, no duplicates on
   webhook redelivery.
2. `GET /api/notifications` returns them newest-first with the right unread count.
3. The bell badge reflects unread count; marking read clears it; marking all read zeroes it.
4. Tapping an item routes to the correct screen and marks that item read.
5. A push from 06 corresponds to a feed item that is present when the app opens.

## Acceptance criteria

- [ ] Webhook writes a deduplicated `activity_log` row per handled GHL event.
- [ ] Notification feed lists recent activity newest-first with correct unread count.
- [ ] Bell badge reflects unread state and updates without a manual refresh.
- [ ] Tapping an item deep-links to the right entity and marks it read.
- [ ] Feed items and push notifications share one event definition and one write path.
- [ ] No reliance on a non-existent GHL notifications pull; the feed is webhook-sourced.

## Rollback

The notifications route and UI are additive (delete the route, `NotificationBell`,
`Notifications.tsx`, header wiring). The webhook's `activity_log` insert is the only change to an
existing file; guard it so a failed insert never breaks webhook handling, and reverting is
removing that insert block.
