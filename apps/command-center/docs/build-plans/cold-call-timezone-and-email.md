# Cold call: correct the clock, and no booking without an email

Two small things on the call card and the booking panel. Both are about the
moment somebody is on the phone.

## 1. The timezone is changeable

Today the prospect's local time comes from their own timezone field if it holds
anything, and otherwise is inferred from the area code, labelled "from the area
code" so nobody mistakes the guess for a fact. The guess is wrong for a handful
of numbers by design: several states straddle a zone line, and an area code is
filed under the zone most of its territory keeps.

There is no way to correct one. The caller learns where the prospect actually is
in the first ten seconds of the call and cannot write it down, so the same wrong
clock greets the next person to open the row.

A small picker sits beside the time. It defaults to "From the area code", which
is not a value but the absence of one: choosing it clears the lead's timezone and
puts the inference back. Choosing a zone overrides it for good.

The picker shows even when neither source says anything, which is the one case
that currently renders nothing at all. A prospect whose area code is unknown is
exactly the one worth setting by hand.

Nothing new is needed server-side: `timezone` is already a writable column on
PATCH /api/admin/tracker/leads.

## 2. A booking needs an email address

The rule was "a phone number OR an email", on the grounds that GoHighLevel needs
somewhere to send a reminder. A phone number always passes it, and every scraped
prospect has one, so in practice the rule never fired and meetings get booked
against contacts with no email.

The rule becomes: an email address, always. It is strictly stricter than what it
replaces, so nothing that books today stops booking for want of a phone number.

Enforced in both places, because the browser is not allowed to be the only thing
holding the line:

- `resolveBookingContact` fails with "Add their email address" (422).
- The Book button is disabled until the typed address passes the same check, and
  says why rather than looking broken.

The panel imports `cleanEmail` from the server module rather than keeping a
second regex, so the two cannot drift. This is an established pattern here
(`src/context/PipelinesContext.tsx` imports from `functions/lib`).

## 3. The last name stays, still optional

No change. It is there for when a caller gets a surname and empty when they do
not, which is most of the time.

## Files

1. `src/lib/leadLocalTime.ts` - `ZONE_CHOICES` (zone + label, in the order a US
   list reads) and `zoneLabel(zone)`.
2. `src/lib/leadLocalTime.test.ts` - every choice is a zone the runtime accepts,
   every zone the area-code map can return is offered, labels are unique.
3. `src/components/admin/acquisition/CallWorkspace.tsx` - `LocalTime` takes an
   `onZone` callback and renders the picker; wired to `useUpdateAdminLead`.
4. `functions/lib/bookingContact.ts` - email required.
5. `functions/lib/bookingContact.test.ts` - the replaced rule, both directions.
6. `src/components/admin/acquisition/BookingPanel.tsx` - Book disabled without a
   usable email, with the reason on the button.

## Verify

- `pnpm vitest run` green.
- Localhost: change a prospect's zone and watch the clock move; set it back to
  "From the area code" and watch the label return. Open a booking on a prospect
  with no email and confirm the button refuses and says why.
