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

Two things read that wake, and both write through the same rules:

- **The cron**, every minute, always. `workers/dialer-cron` wakes up and POSTs
  `/api/admin/cold-call/sync`. No browser involved.
- **The browser poll**, every eight seconds while a calling page is open.
  `GET /api/admin/cold-call/live`. It still syncs, because a caller watching the
  card should not wait up to a minute for it to move.

Either way the reading is the same three steps:

1. `GET /conversations/search?sort=desc&sortBy=last_message_date` — one request,
   naming the conversations that just moved.
2. Any of those inside the window that we do not already hold a call for get
   opened (`GET /conversations/{id}/messages`), capped at six per poll.
3. Each outbound call found becomes a dial row.

In a quiet minute that is one request. During a run of calls it is two or three.

**The `/live` endpoint writes on a GET.** Deliberate, and now a convenience
rather than the whole mechanism: the cron is what makes the record
unconditional. It is idempotent, so the cron and any number of tabs polling over
the same call cannot double count.

### Why the cron exists (2026-08-19)

Recording used to be a side effect of the browser poll alone, which meant the
record depended on somebody having a tab in front. That assumption broke in the
ordinary way. Jake was dialing in GoHighLevel, the Command Center tab sat behind
it, Chrome throttled the background tab's timers, and three real calls went
unrecorded for eight minutes until one late poll swept them up:

| Call | Seconds until recorded |
| --- | --- |
| 2:39:43 | 9 |
| 2:43:03 | 10 |
| 2:44:07 | 468 |
| 2:47:02 | 292 |
| 2:47:39 | 253 |

Every call that day before the gap landed within seventeen seconds. Nothing was
broken, GoHighLevel was healthy, and no code had changed. Nobody was looking.

The dial table feeds the tracker, the funnel and the script variation numbers,
so "was a tab in front" is not an acceptable input to any of them. The cron
removes the browser from the recording path. The browser keeps polling only so
the card moves at conversation speed.

**Attribution when nobody is at the keyboard.** `caller_id` is `NOT NULL` (0052),
so the cron has to name somebody. It uses whoever recorded the last dial in the
past twelve hours, falling back to the last caller ever. The guess is
self-correcting: an outcome press stamps `caller_id` onto the row it completes
(`dials.ts`), so the moment a human judges the call, their id replaces it.

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

The **call card**, and only the call card (Jake, 2026-08-18).

There was a "Waiting on an outcome" panel above it with four quick buttons. It
is gone. Two rows of buttons for the same six outcomes is two ways to record a
call, and the one somebody is looking at is not always the one the dialer is on.
The card is the single place a call is judged.

The live calls still drive it. The card **follows the dialer**: when a live call
belongs to a prospect on screen, that prospect is selected automatically, once
per call, after which the caller can click anywhere and stay there. Every press
carries that call's `dialId`, so it COMPLETES the row the call already wrote
rather than adding a second one.

## Why the press feels instant

The outcome leaves the screen on the click, not when the write returns.

It used to wait on two round trips in a row: the POST tells GoHighLevel what
happened (a second or two of somebody else's API), and only then was the live
query invalidated, whose refetch runs the sync above (another). Until both
landed the judged call was still in the list the card is built from, so the card
sat on the prospect that had just been dealt with.

`useLogColdCallDial` now drops that call from the live cache in `onMutate`, by
`dialId` where there is one. The write is untouched, and a write that fails puts
the call straight back.

## The Power dialer page

`?view=dialing`, in the Cold Call strip after Booked, labelled **Power dialer**
(renamed 2026-08-18). The same calling workspace as a stage page **with no queue
on it**.

It starts EMPTY and stays empty until GoHighLevel rings somebody. A worklist of
prospects here was tried and taken out again (Jake, 2026-08-18): it is a second
answer to "who do I call next", which the stage pages already answer, and the
dialer is not going to read it.

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

## Send to power dialer

Two buttons, one tag.

**Acquisition > Leads** (the scraped list): **Send to power dialer** sits beside
Send to Cold Call. It IS the Cold Call send, with `powerDialer: true` on
`/api/admin/leads/send`: the same GoHighLevel contact, the same prospect book
row, the same stamp, and then the tag. Not a third channel on purpose. A channel
decides where a lead lives; this decides only what happens to it next, and the
two roads must not diverge. SMS cannot go to the dialer, and asking is ignored
rather than obeyed.

**Cold Call > Leads** (the book): the same button in the bulk bar, for prospects
already in it. `POST /api/admin/cold-call/power-dialer` with `{ ids: [...] }`. For each prospect: a contact in the agency account (upserted, so one that is
already there is updated rather than doubled), then the tag **`Power Dialer`** on
it. Jake's workflow in GoHighLevel watches that tag and builds the dialer's list.

The tag sits OUTSIDE the exclusive stage set in `coldCallTags.ts`. A prospect
keeps whichever stage tag they carry while they are queued, because the two say
different things: the stage says where they are in the book, this says they are
next on the phone.

**Nothing here ever removes it.** What becomes of the list once the dialer has
worked through it is decided in GoHighLevel. If a prospect should come off the
list after a call, that is a step in the workflow, not a write from this app: two
systems taking people off a list somebody is dialling is how a dialer ends up
ringing half of what it was given.

200 per press, sequential, and pressing again is a no-op for anything that
already landed. A prospect with no phone and no email is refused, because
GoHighLevel has nothing to key the contact on.

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
- `functions/lib/powerDialerSync.ts` — the sync itself, shared by both callers,
  plus `resolveCronCaller()`.
- `functions/api/admin/cold-call/live.ts` — the browser poll.
- `functions/api/admin/cold-call/sync.ts` — the cron endpoint.
- `functions/lib/coldCallCron.ts` — the gate that lets the cron skip the session.
- `workers/dialer-cron/` — the every-minute Worker. Pages cannot hold a cron
  trigger, so it sits beside the app like ads-cron, health-cron and
  calendar-cron.
- `functions/api/admin/cold-call/dials.ts` — `dialId` completes a pending row.
- `src/components/admin/acquisition/DialCounter.tsx` — the Dials today strip.
- `functions/lib/powerDialer.ts` `tallyDials()` — the count, pure.
- `src/components/admin/acquisition/CallWorkspace.tsx` — follow, and carry
  `dialId` into every press.
- `supabase/migrations/0113_power_dialer.sql`.
- `functions/lib/coldCallTags.ts` (+ tests) — one tag per stage, exclusively.
- `functions/api/admin/cold-call/reconcile.ts` — the push, its preview and limit.
- `functions/api/admin/cold-call/power-dialer.ts` — Send to power dialer (book).
- `functions/api/admin/leads/send.ts` — `powerDialer` on the scraper send.
- `functions/lib/coldCallTags.ts` `POWER_DIALER_TAG` — the tag, "Power Dialer".
- `src/components/admin/acquisition/ColdCallSection.tsx` — the button.

## Secrets / env

`COLD_CALL_CRON_SECRET` (2026-08-19), on BOTH sides and identical:

- the Pages project, bound with
  `node scripts/cf-rebind.mjs --from-doppler --add COLD_CALL_CRON_SECRET`
  (never `cf.mjs env:set`, which blanks every other secret),
- the Worker, with `wrangler secret put COLD_CALL_CRON_SECRET` in
  `workers/dialer-cron`.

Mismatched, every run comes back 401 and calls silently stop being recorded,
which is the exact failure the cron exists to end. `wrangler tail` on the Worker
says so in as many words.

Otherwise `AGENCY_GHL_LOCATION_ID` and `AGENCY_GHL_TOKEN`, already set and
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
