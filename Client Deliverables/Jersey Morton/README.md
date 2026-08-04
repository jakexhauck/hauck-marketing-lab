# Jersey Morton booking page

Live at **https://book.hairbyjersey.com**. A survey sorts a stranger into one of
ten services, prices it, says how long to set aside, then offers only the times
that fit.

**Her Google Calendar is the system of record.** There is no GoHighLevel and no
database. Availability is her bookable start times minus whatever Google says is
busy, and a booking is a Google event with the client invited, which is what
sends the confirmation email. Anything she blocks out herself closes the slot,
because there is nowhere else to keep in sync.

It runs as **Cloudflare Pages Functions**, not a Worker, so the page and the API
share an origin and there is no CORS layer at all.

## Files

| File | What it owns |
|---|---|
| `public/index.html` | The whole page. Mirrors `services.ts` so it renders before the API answers |
| `functions/api/config.ts` | `GET /api/config`, the public values the page needs at runtime |
| `functions/api/availability.ts` | `GET /api/availability`, open start times per day |
| `functions/api/book.ts` | `POST /api/book`, re-checks the slot then writes it |
| `functions/connect.ts` | `GET /connect?key=`, one time, sends her to Google |
| `functions/connected.ts` | Where Google sends her back |
| `functions/lib/config.ts` | Opening hours, timezone, buffer, notice, horizon, closed dates |
| `functions/lib/services.ts` | The authority on price and length |
| `functions/lib/availability.ts` | Opening hours minus busy, sliced to fit a service |
| `functions/lib/calendar.ts` | Google semantics: read busy, write the booking |
| `functions/lib/composio.ts` | Composio v3 REST transport, nothing calendar specific |
| `functions/lib/turnstile.ts` | The only guard on a public endpoint that writes to her calendar |
| `functions/lib/time.ts` | Timezone arithmetic, no dependencies |
| `functions/lib/http.ts` | JSON responses and input scrubbing |

## Environment

Set in the Cloudflare Pages project `book-hairbyjersey`, not in this repo.

| Name | Why |
|---|---|
| `COMPOSIO_API_KEY` | Composio account key |
| `COMPOSIO_GCAL_AUTH_CONFIG_ID` | Which Composio auth config the Google grant belongs to |
| `ADMIN_KEY` | Guards `/connect` so nobody can re-point her calendar at their own Google |
| `TURNSTILE_SITE_KEY` | Public half. The page reads it from `/api/config` |
| `TURNSTILE_SECRET_KEY` | Secret half. Never leaves the Function |
| `CONTACT_PHONE` | Optional. Shown only when the page has no times to offer. Empty means the page says nothing about phoning |

## Connecting her calendar

Once, ever:

```
https://book.hairbyjersey.com/connect?key=<ADMIN_KEY>
```

Sign in as **Jersey**, not as the agency. Composio holds the token afterwards
under `COMPOSIO_USER_ID` in `functions/lib/config.ts`. Changing that id orphans
the connection.

## Deploying

```bash
npm run deploy     # wrangler pages deploy public --project-name book-hairbyjersey
npm test           # node --test, no install needed
```

`wrangler pages deploy` uploads `public/` as static assets and picks up
`functions/` from the working directory, so run it from this folder.

## Local

Opening `public/index.html` straight off disk runs in **demo mode**: the times
are invented and nothing is booked. `?live` forces the real API, `?demo` forces
demo anywhere. For the real thing locally, `npm run dev` runs Wrangler with the
Functions attached, reading secrets from `.dev.vars`.

## Traps

- **`13:30` to `18:00` bounds START times.** A 3 hr service booked at 18:00 runs
  to 21:00 by design. Collisions are prevented by the length plus buffer check
  in `availability.ts`, never by the window.
- **Composio's two execute endpoints answer in different shapes.**
  `/tools/execute/<slug>` returns `successful`; `/tools/execute/proxy` returns
  `status` and no `successful`. Requiring the flag rejects every successful
  proxy call, silently.
- **Price and length are resolved server side from ids.** Never trust the body.
- **`functions/lib/services.ts` is the authority**, `public/index.html` mirrors
  it. Only `test/parity.test.ts` catches drift, and nothing else will tell you.
- **One request covers at most 21 days**, but she books 60 out, so the page
  walks the horizon a fortnight at a time. The first load keeps walking until a
  fortnight has something in it, so a client never lands on an empty strip while
  bookable times sit a week further on.
- **`CALENDAR_ID` is `primary`**, her main calendar, `hairbyjersey.tx@gmail.com`.
- **The Cloudflare token has Pages but not Workers or Turnstile.** That is why
  this is Pages Functions and why Turnstile keys are created by hand.
- **Testing against the live API creates real events and emails real invites.**
  Delete what you create. `jmBookingRef` in `extendedProperties` marks
  everything this page made.

## Known gaps

- **No reminders.** Google emails once at booking and never again.
- **No cancel or reschedule route.** The confirmation says to reply to the
  email, so every change is Jersey editing Google by hand. Every event carries
  `jmBookingRef`, which is what a lookup would need.
- **No deposit.** She is card-only at the chair, so a no-show earns nothing.
  That is a payment provider, not a tweak.
- **Prices and hours live in code.** Blocking a day off works today, she does it
  in Google. Changing a price or her opening hours is an edit and a deploy.
