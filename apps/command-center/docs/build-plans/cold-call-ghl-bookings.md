# Cold call: a booking made in GoHighLevel is still a booking

Honeycutt Heating & Cooling booked a demo on 17 August through the booking
widget, in GoHighLevel, without the booking panel. The suite did not notice.

That is three separate holes, and the prospect fell through all of them.

## What is actually wrong

`cold-call/book.ts` is the only thing that has ever marked a lead Booked. It
creates the contact, creates the appointment, and then writes `status: "Booked"`
and `appointment_date` onto the lead. Every one of those steps is skipped when
somebody books from inside GHL, from a booking link, or from a workflow.

So:

1. **The lead still says New Lead.** It sits on the first dial page waiting for
   a call that has already turned into a meeting, and the next caller to open
   the row will pitch a prospect who is booked.
2. **The meeting is an orphan.** `salesCallSync.ts` adopts it off the calendar
   with `lead_id: null`, because the sync has never looked for the lead behind
   the contact. Cold Call > Booked scopes its rows by `leads.assigned_to`, so an
   unlinked meeting is visible to the owner and to nobody else.
3. **Nothing on the Cold Call pages runs the sync.** `cold-call/meetings.ts`
   reads `sales_calls` and no more. The meeting appears there only after
   somebody opens Sales Calls or Sales Data, which are Jake's pages, not the
   caller's. Until then Booked is confidently, wrongly, empty.

The sync already knows the appointment's `contactId`, and the lead book already
stores `ghl_contact_id` (0053). The two have simply never been introduced.

## The rule

The direction of trust does not change: **GoHighLevel owns whether a meeting
exists and when it is.** What is new is that the lead book now hears about it.

A synced appointment marks its lead Booked when all of these hold:

- the appointment's contact matches a lead by `ghl_contact_id` (exact, never a
  fuzzy name or phone match: a wrong link books the wrong prospect)
- the calendar is a cold call calendar, by the same `isColdCallCalendar` test
  the Booked page filters on. A lead that says Booked whose meeting the Booked
  page will not show is a worse lie than the one being fixed.
- the appointment is not cancelled or a no-show
- the meeting has not already been and gone. The sync reads 90 days back, and
  re-stamping Booked onto prospects whose meeting happened in June would be
  rewriting history, not recording it.
- the lead does not already say Booked on that same day. A meeting MOVED inside
  GHL does update the date, which is the whole point of GHL owning the when.

`last_contact` is deliberately not touched. The app did not dial anybody; a
booking that arrived off a calendar must not fake an attempt in the dial record.
`follow_up_date` is cleared, exactly as `book.ts` clears it: a promise to call
back is superseded by a meeting.

## Files

1. `functions/api/lib/salesCallSync.ts`
   - `leadBookings(events, leads, nowMs)`, pure: the rules above, in one place,
     deduped so a prospect with two meetings gets the next one.
   - `syncAgencyMeetings` reads the matching leads once, sets `lead_id` on both
     new and existing rows that lack it, and applies the bookings.
   - `SyncResult` gains `linked` and `booked`. A sync that quietly rewrote lead
     statuses would be the kind of thing nobody finds out about for a month.
2. `functions/api/lib/salesCallSync.test.ts` - every rule above, both
   directions, including the moved meeting and the meeting long past.
3. `functions/api/admin/cold-call/meetings.ts` - run the sync before reading,
   best effort and skippable with `?sync=0`, the pattern `sales/calls.ts`
   already uses. Returns the result so the page can say when a calendar could
   not be read.
4. `src/lib/api.ts` - `getSalesMeetings` returns `sync`.
5. `src/components/admin/acquisition/ColdCallBooked.tsx` - one line, and only
   when a calendar actually failed. A quiet sync says nothing.

## Verify

- `pnpm vitest run` green.
- Live: the Honeycutt appointment (`bXwzQ9ldXeQjnphZ7qsE`, 17 Aug 16:00 ET, on
  "Demo Call - Cold Call") lands on Cold Call > Booked, and lead
  `44105060-bda0-4b24-bab8-92cf6f73e53f` reads Booked with that date.
- A second sync changes nothing: `booked` and `linked` come back 0.

## Not in this change

The lead is assigned to nobody, so it shows on Jake's unscoped Booked page and
on no caller's. The sync cannot know who booked it and must not guess.
