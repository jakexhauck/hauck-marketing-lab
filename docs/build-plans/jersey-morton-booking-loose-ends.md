# Jersey Morton booking page: finishing it

Build lives at `Client Deliverables/Jersey Morton/`, committed on
`feat/jersey-morton-booking`. Live at **https://book.hairbyjersey.com**.

## Where it actually is

**Proven from the page itself on 4 August 2026**, on a phone viewport, against
the live site: survey, times, form, Turnstile, booking. It wrote a real event
into her calendar at the correct time and length, the slot closed by exactly
the length plus buffer, the event was deleted again and the slot came back.
29 tests pass.

Getting there found three defects that the previous pass had missed, all now
fixed and redeployed:

1. **The page could not book anybody.** `submitBooking` called `render()`
   before building the request, `render()` remounts the Turnstile widget, and
   mounting clears the token. So every booking sent `turnstileToken: null` and
   the server refused it with a 403. The old test asserted the broken line as
   if it were correct.
2. **Every time on the last two screens was the browser's, not hers.** They
   re-derived the hour from a `Date` in local time, so a client one state over
   read a 6pm appointment as 7pm, and a client abroad would read the wrong day.
   Both screens now format in her timezone.
3. **Nobody could see past the first fortnight.** One request covers 14 days
   and she books 60 out, but the page only ever asked for the first 14 and had
   no way forward. If she were busy for two weeks the page was a dead end. It
   now steps the horizon, and skips forward on the first load until it finds a
   fortnight with something in it.

Not finished. Turnstile holds Cloudflare's test keys and filters nothing, and
no real client has used it yet.

Architecture, so nobody has to rediscover it: no GoHighLevel and no database.
Her Google Calendar is the system of record. Availability is her bookable start
times minus Google busy. A booking is a Google event with the client invited,
which is what sends the confirmation. Runs as Cloudflare Pages Functions, so
page and API share an origin.

---

## Phase 0: blocks launch

Nothing goes public until all four are done. Half a day, mostly waiting.

### 0.1 Real Turnstile keys
**Jake, 1 minute.** The booking endpoint is publicly reachable and writes to her
real calendar and emails real invites. Test keys pass everything.

Cloudflare cannot be automated here: a token is not allowed to grant itself
permissions, so this is a dashboard action.

1. dash.cloudflare.com, Turnstile, Add widget
2. Name `book-hairbyjersey`, hostname `book.hairbyjersey.com`, mode Managed
3. Send both keys

Then: `node scratchpad/set-turnstile.mjs <SITE_KEY> <SECRET_KEY>`, no redeploy.
**Done when** a POST to `/api/book` carrying a junk token returns 403 rather
than 201.

### 0.2 Her Google Calendar timezone
**Jersey, 1 minute.** It is set to UTC. Bookings store correctly, so clients are
never misled, but she reads every appointment five hours late. A 2pm cut shows
as 7pm.

Google Calendar, Settings, Timezone, Central Time.
**Done when** a test event created at 13:30 Central displays as 13:30 to her.

### 0.3 Read the confirmation email
**Jake, 5 minutes.** One is already sitting in `contact.jakehauck@gmail.com`:
the 4 August test booked Friday 2 Oct at 6:00 pm, then cancelled it, so there
should be an invite and a cancellation. Nobody has read either.

**Done when** you have read it on a phone and it shows the right service, time
and length, and did not land in spam. If it reads poorly, the fix is
`eventDescription` in `functions/lib/calendar.ts`.

### 0.4 Click through on a phone
**Done, 4 August.** Driven at 390x844 through the whole funnel, ending in a
real booking. What is left is a human check on a real handset, which is worth
five minutes but no longer blocks anything.

---

## Phase 1: before it gets real volume

### 1.1 Reminders
**Half a day.** The single highest-value thing left. Google emails once at
booking and never again. A 3 hr bleach that does not turn up costs her the
entire afternoon.

Cheapest version: set `reminders.overrides` on the event so Google emails the
attendee 24 hours before, instead of `useDefault: true`. One field in
`createBooking`, no new infrastructure.

Better version, later: SMS the day before. Needs a provider and her phone
number, so it is a real project.
**Done when** a test booking produces a reminder email a day out.

### 1.2 Cancel and reschedule
**Half a day.** Currently the confirmation says "reply to this email", so every
change is Jersey editing Google by hand and the client hears nothing back.

Every event carries `jmBookingRef` in `extendedProperties`, which is exactly
what a lookup needs. Add `GET /r/<ref>` showing the booking with Cancel and
Reschedule, both re-running `isStillFree` before writing.
**Done when** a client can move their own appointment and both sides get mail.

### 1.3 The whole-horizon empty state
**Done, 4 August.** It was worse than unrendered: it fell back to day one,
disabled every day button, and told the client to pick another day. It now
drops the strip and says she is booked solid, with her number if
`CONTACT_PHONE` is set. Verified by stubbing an empty horizon in the browser.

---

## Phase 2: business gaps, Jake's call

### 2.1 Deposits
She is card-only at the chair, so a no-show earns nothing and burns a slot she
could have sold. A deposit needs a payment provider and is a proper project,
not a tweak. Worth costing before she is busy enough to care.

### 2.2 Prices and hours live in code
Blocking a day off works today: she blocks it in Google. But changing a price,
a duration, or her opening hours means me editing `functions/lib/config.ts` and
deploying. Fine now, irritating by month three.

If she will be fiddling, this wants a small admin page. If she will not, leave
it. Do not build it speculatively.

### 2.3 A Book button on her main site
Her site is on Vercel; the booking page is a Cloudflare subdomain. Somebody has
to add the link. Not my repo.

### 2.4 Analytics
No idea how many people start the survey and abandon. One lightweight event on
each step would answer it. Cheap, and it tells you whether the survey is the
problem or the prices are.

---

## Phase 3: elsewhere in the estate

### 3.1 The same Composio bug is in command-center
**Fixed, 4 August.** `proxyCall` now has its own `unwrapProxy`, which reads the
upstream status instead of demanding a `successful` field the proxy endpoint
never sends. `mirrorAppointment` also logs a genuine failure rather than
swallowing it. Its old test asserted the wrong envelope shape, which is why the
bug survived; the test now uses the real one.

**Not proven against live Composio.** It passes 46 tests but no real
appointment has been mirrored since the fix. Worth booking one job in the
console and checking it lands on that tenant's Google Calendar.

---

## Traps, for whoever picks this up

- **`13:30` to `18:00` bounds START times.** A 3 hr service booked at 18:00 runs
  to 21:00 by design. Collisions are prevented by the length plus buffer check,
  never by the window.
- **Composio's two execute endpoints answer in different shapes.**
  `/tools/execute/<slug>` returns `successful`; `/tools/execute/proxy` returns
  `status` and no `successful`. Requiring the flag rejects every successful
  proxy call, silently. This cost an hour.
- **Price and length are resolved server side from ids.** Never trust the body.
- **`functions/lib/services.ts` is the authority**, `public/index.html` mirrors
  it so the page renders before the API answers. Only `parity.test.ts` catches
  drift, and nothing else will tell you.
- **`CALENDAR_ID` is `primary`.** Confirmed correct: her salon work is on her
  main calendar, `hairbyjersey.tx@gmail.com`. If that ever changes, availability
  silently stops reflecting reality.
- **The Cloudflare token has Pages but not Workers or Turnstile.** That is why
  this is Pages Functions and why key creation is manual.
- **Testing against the live API creates real events and emails real invites.**
  Delete what you create. `jmBookingRef` marks everything this page made. The
  cleanup script that deletes one by event id is in this session's scratchpad;
  it lists Jersey's connected accounts under Composio user `jersey-morton` and
  sends a proxy DELETE with `sendUpdates=all`.
- **One request covers at most 21 days, she books 60 out.** The page walks the
  horizon a fortnight at a time. A change to `DAYS_SHOWN` or the horizon has to
  keep `MAX_WINDOWS` big enough to reach the end.
- **A Cloudflare deploy is not instantly global.** Straight after a deploy the
  edge served the previous `index.html` to a browser while curl already had the
  new one. Give it a minute before concluding a fix did not work.
