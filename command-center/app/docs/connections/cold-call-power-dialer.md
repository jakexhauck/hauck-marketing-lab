# Power dialer: following it, and keeping the count honest

Legend: ❌ not wired · ⚠️ partial · ✅ live.

Status: ✅ **live**, deployed 2026-08-17 (commit `2010f61`). Migration 0113
applied. Built and verified on localhost first, against a real dialing session.

Smoke-tested on app.hauckmarketing.com after the deploy: the endpoint answers
`{"configured":true,...}` to a signed admin session, and the calling page polls
it every 8.5 seconds. The panel was correctly absent, because at that moment
nothing was waiting on an outcome.

## The problem it solves

GoHighLevel's power dialer works a list on its own and moves on the instant a
call ends. Nothing tells this app which business is on the phone. So an outcome
pressed on the call card lands on whichever prospect the card happens to be
showing, which after two rings is the wrong one, and the daily counts become a
record of clicks rather than of calls.

## The mechanism

Nothing in GoHighLevel exposes a dialer session. What it exposes is the wake:
every call it places lands on the prospect's conversation as a call message with
a timestamp, a CallSid, a status and a duration.

`GET /api/admin/cold-call/live` reads that wake, once every eight seconds while a
calling page is open:

1. `GET /conversations/search?sort=desc&sortBy=last_message_date` — one request,
   naming the conversations that just moved.
2. Any of those inside the window that we do not already hold a call for get
   opened (`GET /conversations/{id}/messages`), capped at six per poll.
3. Each outbound call found becomes a dial row.

In a quiet minute that is one request. During a run of calls it is two or three.

**The endpoint writes on a GET.** Deliberate: the alternative is a separate sync
somebody has to remember to run, and a caller mid-shift with a dialer going is
exactly who would not. It is idempotent, so polling twice, or from two tabs,
cannot double count.

## What keeps it accurate

The one rule: **one real call, one row.**

- Every row carries `call_message_id`, unique where set (0113). A retried request
  or an overlapping poll cannot record the same call twice.
- A call the caller already recorded by hand is **stamped**, not duplicated: same
  contact, a row within `-2min / +12min` of the call, no message id on it yet.
  It gains the duration it could never have had.
- A call nobody has recorded becomes `outcome = 'pending'`.
- Pressing an outcome on a pending row **completes** it (`dialId` in the POST
  body) rather than writing a second row. A second press answers **409**, so a
  double click cannot overwrite an answer already given.
- The day stays the day of the CALL, not of the press. A call at 11.58pm judged
  at 12.02am belongs to the shift that made it.

What a pending row counts as, in the tracker's derived numbers: one call made,
no pickup, no pass-through, no booking. That is the honest reading. The call
provably happened; whether anybody picked up is a human judgement nobody has made
yet, and inferring it from the duration would be inventing the one number
`cold_call_dials` exists to not invent.

## What the caller sees

A **Waiting on an outcome** panel above the queue, on both calling pages. Silent
when there is nothing waiting, so a caller working the queue by hand never sees
it.

- Newest first, a filled dot for the call happening now.
- Business, the time it started, and the duration or GoHighLevel's status word.
- Four icon buttons: no answer, not qualified, heard opener, heard pitch. Those
  are the outcomes that need pressing before the dialer has moved on twice more.
- Clicking the business opens it in the queue below, where the full set of
  buttons lives (a callback needs a date, a booking needs a calendar).
- A prospect in another stage says which stage instead of pretending to be
  selectable.

The card **follows the dialer**: when a live call belongs to a prospect in the
queue on screen, that prospect is selected automatically, once per call. After
that the caller can click anywhere and stay there.

## The count, while the calling is happening

`GET /api/admin/cold-call/live` also answers `today`: the day's dial count and
who made them.

```
today: { day: "2026-08-18", total: 118, callers: [ { callerId, name, dials } ] }
```

Counted from `cold_call_dials` rows whose `day` equals the agency's day, read
AFTER the sync in the same request, so a call the dialer placed twenty seconds
ago is already in the number. No new request and no second poll: the count rides
the recorder, which means it cannot be running while the recording is not.

**Pending rows count.** GoHighLevel's phone system reported the call, so it
happened; what it became is the question the panel below asks. A count that
waited for the press would read low all shift and then jump.

**Every dial, not just the dialer's.** A call recorded by hand off the card is
the same row, so the number is the shift's calling, however it was placed.

A dial whose caller has since been deleted stays in the total and sits under
nobody, which is the honest shape.

On screen: a **Dials today** strip at the top of every calling page, from
`CallWorkspace`, so the stage pages and the Dialing page have it by construction.
Names and per-person counts appear only when more than one person has dialled
today, since one caller's breakdown is the total said twice.

## The Dialing page

`?view=dialing`, in the Cold Call strip after Booked. The same calling workspace
as a stage page **with no queue on it**.

The stage pages answer "who do I call next", which is a list. While a dialing
session is running that is the wrong question: the phone has already chosen, and
all that is left is what became of the call. This page answers only that.

It is the same `CallWorkspace` component with `hideQueue`, not a copy, so the
six outcomes, the script attribution, the callback picker, the booking panel and
every write are identical by construction. Two ways of recording a `pitch_no`
would be two numbers to argue over.

What is on the card is whichever call the panel is on, newest first. Empty it
reads "No calls waiting".

It does NOT change the section's landing page: the strip order puts it after the
stages, and `resolveColdCallView` falls back to the first page.

## Prospects the app has never seen

A dialer can be pointed at any list in GoHighLevel. A call to a contact with no
lead here creates one, from the contact record, with source `Power dialer`.
Before that it tries to match an existing lead on the last ten digits of the
number, and backfills `ghl_contact_id` when it finds one, so the same prospect
imported here and dialled over there stops being two records.

## Pointing the dialer at the right people (Push to GoHighLevel)

A power dialer is only as good as the list it is given, and a Smart List only
equals a page of this section if every prospect on that page carries one tag and
nobody else does. The tags existed already; the guarantee did not.

**Push to GoHighLevel**, in the Cold Call header, owner only, makes the whole
book true at once: every live lead gets a contact, and every contact gets
exactly the one tag its stage means.

| Stage | Tag |
|---|---|
| New Lead | `cc new lead` |
| No Answer Day 1 | `cc no answer day 1` |
| No Answer Day 2 | `cc no answer day 2` |
| Call Back | `cc call back` |
| Not Interested | `cc not interested` |
| Booked | none, the appointment is the state |

So a Smart List is one filter, with no "does not have" conditions holding it
together.

**`cc new lead` is now removable** (Jake's call, 2026-08-17). It was applied on
import and never taken off, so a prospect called five times still read as new
and New Lead was the one list a dialer could not be pointed at. It is in
`ALL_CC_TAGS` now, which means the outcome press strips it too. Anything in
GoHighLevel watching that tag should expect it to disappear on the first call.

**Two presses.** The first previews and writes nothing; the second writes. The
button then names the number, so nobody discovers how many contacts this touches
by watching it touch them. `?preview=1` and `?limit=N` are on the endpoint for
the same reason.

**By hand only.** No timer, no run on page load. It writes to live contact
records, so the moment it happens should be a moment somebody chose.

Cheap to repeat: it reads every contact once in bulk, then decides. A settled
book is a handful of reads and no writes.

First preview on the live account, 2026-08-17: **275 in the book, 0 missing a
contact, 182 to retag, 93 already right.** Of those 182, 174 were purely the
`cc new lead` strip; the remaining 8 also needed their own tag or had an old
stage tag to clean off.

## Files

- `functions/lib/powerDialer.ts` (+ tests) — every rule above, pure.
- `functions/lib/agencyCallLog.ts` — the three GoHighLevel reads.
- `functions/api/admin/cold-call/live.ts` — the poll and the sync.
- `functions/api/admin/cold-call/dials.ts` — `dialId` completes a pending row.
- `src/components/admin/acquisition/PowerDialerPanel.tsx` — the panel.
- `src/components/admin/acquisition/DialCounter.tsx` — the Dials today strip.
- `functions/lib/powerDialer.ts` `tallyDials()` — the count, pure.
- `src/components/admin/acquisition/CallWorkspace.tsx` — follow, and carry
  `dialId` into every press.
- `supabase/migrations/0113_power_dialer.sql`.
- `functions/lib/coldCallTags.ts` (+ tests) — one tag per stage, exclusively.
- `functions/api/admin/cold-call/reconcile.ts` — the push, its preview and limit.
- `src/components/admin/acquisition/ColdCallSection.tsx` — the button.

## Secrets / env

Nothing new. `AGENCY_GHL_LOCATION_ID` and `AGENCY_GHL_TOKEN`, already set and
shared with the rest of the cold call suite. Unconfigured, the endpoint answers
`configured: false` and the panel never appears.

Token scopes: conversations read (the search and the messages), contacts read
(a prospect the book has never seen).

## Verified 2026-08-17

Against Jake's own live dialing session, on localhost:

- The panel showed **All Safe Heating & Cooling** as live, `callStatus:
  "ringing"`, while that call was ringing.
- Six conversations opened, and four of the calls in them **matched dial rows
  Jake had already written by hand** and were stamped rather than duplicated.
- One call had no row at all (a prospect dialled from GoHighLevel's own board)
  and was recorded.
- Completing a pending row updated it in place and preserved its duration; a
  second press returned 409.
- Every test row was removed afterwards; the live counts were left as found.

## Known, and deliberate

- It is a poll, so a call is visible a few seconds after it starts. "Who was
  that" is answerable; "who is on the line this exact second" is not, quite.
- A duration of null is normal: an unanswered call reads that way, and so does
  an answered one for the half minute GoHighLevel takes to finalise the message.
- The panel's four buttons do not cover callback or booked on purpose. Both need
  more than a click, and both belong on the card.

## If it is ever wired to a webhook instead

The Call Status trigger in GoHighLevel would push these calls rather than having
them polled. It was not used because it fires when a call ENDS, which is the
same moment the poll finds it, and it would put a piece of this system in a
workflow that cannot be read back over the API (see `cold-call-dialer.md` for
what that already cost). The poll needs nothing built in GoHighLevel at all.
