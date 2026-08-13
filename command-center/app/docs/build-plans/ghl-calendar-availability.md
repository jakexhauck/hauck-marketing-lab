# Fulfillment > GHL > Calendars

## The job

A client links their Google Calendar on the connect screen. Their real
commitments are supposed to stop a customer being offered a time they are not
free for. Two things stand between that promise and the truth:

1. Nothing ever calls the sync. `CALENDAR_CRON_SECRET` is set in neither Doppler
   nor Cloudflare and no Worker exists, so `functions/lib/calendarSync.ts` has
   never run in production. Fixed by `workers/calendar-cron`.
2. The sync protects exactly ONE calendar per client, found by matching the name
   "Home Estimate". Made Better and Willis each have four calendars. Every other
   one can still be booked over the top of the owner's own diary.

This plan covers the second, as a page rather than a constant: which calendars a
client's busy time protects is an operator decision, and it belongs on screen
next to the rest of the GHL wiring.

## Definition of done

Fulfillment > GHL > **Calendars**, per client:

- Whether that client has linked a Google Calendar at all, said plainly.
- Every calendar in their sub-account, live from GHL, with its open hours.
- A switch per calendar: does the owner's busy time block this one.
- Sync now, with what it created, moved and freed.

Nothing on the page invents a calendar or edits GHL's own availability hours.
It decides what our sync protects, and shows the hours so the decision is
informed.

## Files

| File | Change |
| --- | --- |
| `supabase/migrations/0107_calendar_protection.sql` | New `tenant_blocked_calendars`. `gcal_busy_blocks` primary key gains `ghl_calendar_id`, so one Google meeting can hold a block on several calendars. |
| `functions/lib/calendarSync.ts` | Sync every selected calendar rather than one. No selection falls back to today's name match, so no client silently loses protection on deploy. |
| `functions/lib/calendarSync.test.ts` | The per-calendar diff, and the fallback. |
| `functions/api/admin/clients/[tenantId]/calendars.ts` | GET the calendars + link state + selection. POST the selection. |
| `src/hooks/useApi.ts` | `useClientCalendarsQuery`, `useSetBlockedCalendars`, `useCalendarSyncNow`. |
| `src/components/admin/cockpit/ghl/CalendarPanel.tsx` | The page. |
| `src/components/admin/cockpit/ghl/GhlTab.tsx` | One more case. |
| `src/lib/fulfillmentPages.ts` | The sub-tab. |
| `docs/connections/google-calendar.md` | The section on what is protected, and by what. |

## What the page turned into

The first cut had a Sync now button and a column headed "Blocked by their
diary", and both were wrong. Sync is not a thing an operator should have to
think about, and the column was jargon. What replaced them:

- **No sync button.** The page fires the sync itself on load and again after a
  busy switch changes, on top of the Worker's own quarter-hourly run.
- **Hours are editable**, per calendar, per day, with more than one set of hours
  a day where a client works split shifts. Saving writes straight into GHL.
- **The switch says what it does**: "Nobody can book" / "Still bookable", under
  the heading "When they are busy in Google".

## The trap in writing hours to GHL

A `PUT /calendars/{id}` carrying only `openHours` **silently resets settings it
was not sent**. Proved on Made Better's Dialers calendar on 2026-08-13: 15
minute slots came back 30, the interval came back 30, and two buffer fields
appeared. Nothing errors.

A full echo of the record is rejected 422: `formSubmitRedirectUrl` is not
writable and `teamMembers` may not be sent empty.

So `functions/lib/ghlCalendarWrite.ts` is read-modify-write over an explicit
list of fields to carry back. `PRESERVED_FIELDS` is that list, and anything
added to a GHL calendar that behaves like a setting belongs in it.

## Decisions

**A table, not an array column.** `estimate_calendar_id` stays where it is and
keeps working as the fallback. Selection is rows, so a calendar deleted in GHL
leaves one dead row rather than a silently wrong list.

**The fallback is the old behaviour, not "everything".** A client with no
selection keeps exactly the protection they have today. Defaulting to every
calendar would strip availability from services an operator never looked at.

**Open hours are read-only here.** Editing a GHL calendar's own availability is
a different job with a different blast radius, and this page is about what our
sync does. If it is wanted, it is the next build, not a checkbox on this one.
