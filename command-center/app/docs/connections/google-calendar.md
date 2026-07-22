# Google Calendar (client-linked)

The client links their **own** Google Calendar from the Jobs page. The Jobs
calendar then greys out the hours they are already busy, and appointments booked
in the app are mirrored into that calendar.

This is the first per-client OAuth connection in the app. Every other
integration (Meta, GA4, Places) uses one agency credential plus a per-client id.

## What the client sees

On the Jobs tab, a **Link Google Calendar** button sits beside the view
switcher, in every view including the default Jobs list. Clicking it sends them
to Google's consent screen. When they come back, the button is replaced by
"Google Calendar linked" and an Unlink action.

It was originally hidden on the Jobs list view, on the theory that the offer
only makes sense while a calendar is on screen. That failed the first contact
with a real user: the default view is Jobs, so the button was invisible until
you already knew to go looking for it. Discoverability beats contextual purity
for a one-time setup action.

The button still hides when the broker is not configured in the environment.

## Architecture

Composio brokers the OAuth grant and holds the token. **We store nothing.**

- Composio's `user_id` is `"<mode>:<slug>"` from `TenantContext`
  (`composioUserId()` in `functions/lib/googleCalendar.ts`). `TenantContext`
  carries no row id, and the mode is part of the key so a test workspace can
  never resolve to the calendar the live workspace linked.
- No Supabase table, no migration. Connection state is read from Composio.
- No SDK. `@composio/core` is untested on the Cloudflare Workers runtime, so
  `functions/lib/composio.ts` calls the v3 REST API with plain `fetch`.

Two layers, deliberately separate:

| File | Responsibility |
|---|---|
| `functions/lib/composio.ts` | Transport only. Knows nothing about calendars. |
| `functions/lib/googleCalendar.ts` | Calendar semantics. Knows nothing about HTTP. |

Swapping Composio for direct Google OAuth later touches the first file only.

## Routes

| Route | Returns |
|---|---|
| `GET /api/connections/google-calendar` | `{ connected, status }` |
| `POST /api/connections/google-calendar/start` | `{ redirectUrl }` |
| `DELETE /api/connections/google-calendar` | `{ ok: true }`, revokes upstream |
| `GET /api/calendar/busy?start=&end=&tz=` | `{ connected, busy: [{start,end}] }` |

All are tenant-session gated by `_middleware.ts`, **not** admin gated. The whole
point is that the client links their own calendar without the agency involved.

There is no callback route of ours: Composio performs the token exchange and
returns the client to `/sales/jobs?calendar=connected`.

## Secrets

Both live in Doppler (`hauck-command-center` / `prd`) and are agency-wide:

- `COMPOSIO_API_KEY`
- `COMPOSIO_GCAL_AUTH_CONFIG_ID` (currently `ac_Lu6oZLNwRQRE`)

Push with `cf-rebind --from-doppler`.

## Scopes, and what they actually permit

Composio's managed Google client offers **only** these two, confirmed live from
`GET /api/v3/toolkits/googlecalendar`:

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

`calendar.freebusy` is **not available** on managed auth. Narrowing below full
calendar access is impossible without bringing our own Google OAuth client,
which would require Google sensitive-scope verification.

So the client's consent screen reads "See, edit, share, and permanently delete
all the calendars you can access", even though the app only ever reads
availability and writes its own events. This was accepted deliberately, in
exchange for skipping Google verification. Moving to a narrower, agency-branded
client later is a change to the auth config id, not to app code.

## Why Composio rather than GHL

GHL exposes a `/calendars/connections` surface (it returns 401 rather than 404
on the Willis PIT), but it was never confirmed to support an API-initiable
Google OAuth. Composio works today. If the GHL route is later proven, it would
be cheaper still, because the Jobs feed already reads GHL calendar events.

## Rendering rules

- **Week**: a full-width background band behind the day.
- **Agenda**: a quiet dashed row showing only the time and the word Busy.
- **Month**: excluded. Grey chips in every cell drown the actual work.
- Busy is a normal `CalendarSource`, so the legend can toggle it off.
- Busy is excluded from `packDayColumns`. This matters: without it, a client
  with a full personal calendar would have their real jobs squashed into
  slivers by lane competition.

## Timezone

The browser sends its own IANA zone as `tz`, and Composio returns busy intervals
in that zone. The frontend then parses the wall-clock literal.

`TENANT_TIMEZONE` exists in `Env` but is unused everywhere and unset in Doppler.
Do not reach for it.

## Failure behaviour

Every path degrades to "not connected" rather than erroring:

- Composio unconfigured, down, or rate limited: `getConnection` and `getBusy`
  swallow it and the calendar renders exactly as it did before this feature.
- Composio managed auth shares a rate-limit quota with every other Composio
  customer, so throttling is a real possibility. The busy route sets
  `Cache-Control: private, max-age=60` and the hook holds a 60s stale time.

## Mirroring bookings out

`mirrorAppointment()` stamps our appointment id into the Google event's
`extendedProperties.private.hmlAppointmentId`, then finds it again on reschedule
via `GOOGLECALENDAR_EVENTS_LIST`'s `privateExtendedProperty` filter. That is what
makes a reschedule move the event instead of creating a second one.

Writing that field needs `POST /api/v3/tools/execute/proxy`: no Composio Google
Calendar write tool exposes `extendedProperties`, though the list tool can filter
on it.

Called from `functions/api/appointments/index.ts` (create) and
`[eventId].ts` (reschedule), inside `waitUntil` and after the GHL write has
already succeeded.

## Known limitations

- **Cancelling an app appointment leaves an orphan Google event.** Not handled.
- **Primary calendar only.** No picker.
- **Desktop only**, matching the Jobs and Calendar merge.
- The connected account's email is not shown. Composio does not expose it on the
  account record; it would need a provider round trip.

## Gotchas for the next person

- `successful: false` arrives with **HTTP 200**. Branch on the body.
- Use `POST /connected_accounts/link`, not `POST /connected_accounts`. The
  latter returns 400 for managed OAuth2 as of 2026-07-03.
- Connected-account query params are **plural arrays**: `user_ids`,
  `auth_config_ids`.
- The status enum has **seven** values. Only `ACTIVE` can execute tools.
- `GOOGLECALENDAR_CREATE_EVENT` splits duration into `event_duration_hour` and
  `event_duration_minutes` (**0 to 59 only**). We avoid it entirely by using the
  proxy, but note it if you ever switch.
- The published Composio tool list contains at least one slug that 404s live
  (`GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS`). Probe before depending on one.
