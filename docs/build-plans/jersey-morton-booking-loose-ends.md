# Jersey Morton booking page: finishing it

Build lives at `Client Deliverables/Jersey Morton/`, committed on
`feat/jersey-morton-booking`. Live at **https://book.hairbyjersey.com**.

## Where it actually is

Working and proven end to end: a real booking wrote into her Google Calendar
at the correct time and length, and was deleted again. 25 tests pass.

Not finished. Turnstile holds Cloudflare's test keys and filters nothing, no
client has ever used it, and nobody has read the confirmation email it sends.

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
**Jake, 10 minutes.** The whole confirmation story rests on Google's invite mail
and nobody has looked at one. It may read badly, or land in spam.

Book one to a real address, read it on a phone, then delete the event.
**Done when** the invite arrives, is legible, and shows the right service, time
and length. If it reads poorly, the fix is `eventDescription` in
`functions/lib/calendar.ts`.

### 0.4 Click through on a phone
**Jake, 5 minutes.** Most of her bookings will be mobile and nobody has opened
it on a handset. Built responsive, never verified.
**Done when** the survey, day strip, slot grid and form all work one-handed.

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
**1 hour.** Per-day empty copy exists. The case where she is fully booked for
all 60 days has never been rendered and probably looks broken.
**Done when** the page says something sensible with zero slots anywhere.

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
`command-center/app/functions/lib/composio.ts` shares the `unwrap` that requires
a `successful` field the proxy endpoint never returns. `mirrorAppointment` is
its only proxy caller and it swallows every failure silently.

That is very likely why mirror-out has never once been proven since 19 July.
Untouched so far because it is a different project. Roughly an hour to fix and
test.

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
  Delete what you create. `jmBookingRef` marks everything this page made.
