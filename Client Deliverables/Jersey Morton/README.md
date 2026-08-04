# Jersey Morton booking API

The back end for `../index.html`. No GoHighLevel, no database.

**Her Google Calendar is the system of record.** Availability is her opening
hours minus whatever Google says is busy. A booking is a Google event with the
client invited, which is what sends the confirmation email. Anything she blocks
out in her own calendar closes the slot automatically, because there is no
second place to keep in sync.

## Files

| File | What it owns |
|---|---|
| `src/config.ts` | Opening hours, timezone, buffer, notice, horizon, closed dates |
| `src/services.ts` | The authority on price and length. `index.html` mirrors it |
| `src/time.ts` | Timezone arithmetic, no dependencies |
| `src/availability.ts` | Opening hours minus busy, sliced to fit a service |
| `src/composio.ts` | Composio v3 REST transport, nothing calendar specific |
| `src/calendar.ts` | Google semantics: read busy, write the booking |
| `src/index.ts` | Routes |

## Routes

| Route | Does |
|---|---|
| `GET /api/services` | What can be booked |
| `GET /api/availability?service=&addons=&from=&days=` | Open start times per day |
| `POST /api/book` | Re-checks the slot, then writes it to her calendar |
| `GET /connect?key=ADMIN_KEY` | One time. Sends her to Google |

Prices and lengths are always resolved from service ids on the server. Whatever
the page sends for cost or duration is ignored.

## Setting it up

```bash
cd worker
npm install

wrangler secret put COMPOSIO_API_KEY
wrangler secret put COMPOSIO_GCAL_AUTH_CONFIG_ID
wrangler secret put ADMIN_KEY          # any long random string

npm run deploy
```

Then, once only, open in a browser:

```
https://<your-worker>.workers.dev/connect?key=<ADMIN_KEY>
```

Sign in as **Jersey**, not as the agency. Composio holds the token afterwards
under the user id in `config.ts`.

Finally, paste the worker URL into `API_BASE` at the top of `../index.html`.
While `API_BASE` is empty the page runs in demo mode: the times are invented and
nothing is booked.

Once the page has a real domain, set `ALLOWED_ORIGINS` in `wrangler.toml` so the
booking API only answers that page.

## Tests

```bash
npm test
```

Covers the slot maths, daylight saving, the buffer, minimum notice, the
double-booking re-check, and parity between `services.ts` and `index.html`.

## Known gaps

- **No rate limiting.** Nothing stops someone scripting bookings. Needs a KV
  namespace or Cloudflare Turnstile on the booking step before this is public
  on a real domain.
- **No cancel or reschedule route.** The confirmation email tells the client to
  reply. Every booking is stamped with `jmBookingRef` in the event's
  `extendedProperties`, so a route can find and move the original later.
- **No deposit.** If she ever wants card on file, that is a payment provider,
  not this worker.
