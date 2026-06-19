# 10: Calendar & Appointments

## Objective

Add a Calendar section that populates with the client's booked meetings: an agenda of upcoming
appointments pulled live from GHL, with detail (who, when, where/link, status). Phase two,
optional: let the client book and reschedule from inside the app using GHL's free-slots API.

## Why it matters

This is the feature most asked for and the one a client checks daily. It also closes the loop
with tasks (09): tasks are things to do, appointments are things to attend, and together they
form the client's day. A read-only agenda is high value for low risk, so ship that first and
treat in-app booking as a separate, later increment.

## Dependencies

- None hard for the read-only agenda.
- Pairs naturally with 09 (tasks) on a combined "Today" surface.
- In-app booking (phase two) is heavier and should not block the agenda shipping.

## Current state

Nothing. No calendar endpoints, no calendar route, no nav entry. The bottom nav
(`src/components/BottomNav.tsx`) currently has four items: Home, Leads, Chats, Contacts.

## Target state

GHL endpoints (v2, version `2021-07-28`):

- `GET  /calendars/?locationId={id}`                     list the location's calendars
- `GET  /calendars/events?locationId={id}&startTime=&endTime=&calendarId=&userId=`   booked events
- `GET  /calendars/events/appointments/{eventId}`        single appointment detail
- `GET  /calendars/{calendarId}/free-slots?startDate=&endDate=&timezone=`   (phase two)
- `POST /calendars/events/appointments`                  create (phase two)
- `PUT  /calendars/events/appointments/{eventId}`        reschedule (phase two)
- `DELETE /calendars/events/{eventId}`                   cancel (phase two)

> Confirm the time format on a live response before building. GHL's `startTime`/`endTime` query
> params are commonly epoch milliseconds or ISO 8601 depending on API version; events come back
> with ISO timestamps plus the location timezone. Render in the location timezone, not the
> device timezone, or a client three timezones away sees the wrong meeting time.

A read-only **agenda**: a `functions/api/calendar/events.ts` route that defaults to "now to +30
days", returns events sorted ascending, each enriched with the contact name. A new `Calendar.tsx`
route showing day-grouped upcoming appointments. A fifth bottom-nav entry (or, if five is too
many for the nav bar, a Calendar card on Home that deep-links to a full agenda screen).

## Step-by-step

### 1. Discover the calendars

`GET /calendars/?locationId=` to learn which calendars exist. Most clients have one or two. Cache
this for the session (same 5-minute in-memory pattern as `functions/api/pipeline.ts`).

### 2. Events route

`functions/api/calendar/events.ts`. Accept optional `from`/`to` query params, default to now and
now+30d. Query GHL events, then enrich each event's `contactId` to a display name. Two ways to
enrich without N calls:

- If the events response already includes contact name fields, use them.
- Otherwise reuse the contacts list (already paginated in `functions/api/contacts.ts`) as a
  lookup map by id rather than firing one contact request per event.

Return `{ events: [{ id, title, startTime, endTime, status, contactId, contactName, address,
meetingUrl }] }`, sorted ascending.

### 3. Client API + hook

`getCalendarEvents(from?, to?)` in `api.ts`; `useCalendarEvents()` hook. Standard query, with the
offline cache (07) applying for free if that doc has landed.

### 4. `Calendar.tsx` route + nav

Day-grouped agenda ("Today", "Tomorrow", then dated headers). Each row: time, title, contact,
status pill (booked / confirmed / cancelled / no-show), and a tap-through to detail. Add the
route to `App.tsx` and decide nav placement (see Target state note on five-item nav).

### 5. Appointment detail

Tap a row to a detail sheet: full time range, contact with call/message shortcuts (reuse the lead
detail's contact actions), location or meeting link, and notes. For phase one this is read-only.

### 6. (Phase two, separate increment) booking & reschedule

Behind the free-slots API: pick a calendar, fetch open slots, create or move an appointment. Keep
this out of the first ship. Flag clearly in the UI whether the client is allowed to self-book or
the agency owns scheduling, since that is a policy choice, not a technical one.

## Testing

1. `GET /api/calendar/events` returns the test account's upcoming appointments, ascending.
2. An appointment booked in GHL appears in the app within the cache window.
3. Times render in the location timezone, verified against the same event in GHL's UI.
4. Cancelled/no-show statuses render distinctly and are not silently dropped.
5. An empty calendar shows the `EmptyState`, not an error.

## Acceptance criteria

- [ ] Calendar section lists upcoming appointments, soonest first, grouped by day.
- [ ] Each appointment shows contact name, time range, and status.
- [ ] Times are rendered in the location's timezone.
- [ ] Contact enrichment does not fire one request per event (uses a lookup map or inline fields).
- [ ] Nav placement decided and consistent (fifth tab or Home card + full screen).
- [ ] Booking/reschedule is explicitly out of scope for phase one and noted as such.

## Rollback

Delete `functions/api/calendar/`, `Calendar.tsx`, its route registration, the nav entry, and the
two `api.ts`/hook additions. Read-only and isolated; no writes to roll back in phase one.
