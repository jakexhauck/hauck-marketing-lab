# hauck-calendar-cron

The alarm clock for the client's Google Calendar.

A client links their own Google Calendar on the connect screen and is told their
real commitments will not be offered to customers. The app writes those
commitments into the GoHighLevel calendar customers book into, as blocked slots
it also knows how to take back out. Nothing called that sync until this Worker
existed, so `CALENDAR_CRON_SECRET` was set nowhere and the blocks were never
written.

Cloudflare Pages projects cannot carry a cron trigger, so the thing that wakes
up lives here, beside the app rather than inside it. It makes one authenticated
POST to `/api/admin/calendar/sync` and logs the result.

## Why every fifteen minutes

The window that matters is between a client accepting something in their own
diary and a customer being offered that same slot. Nightly would mean a whole
working day of double bookings, which is the exact failure the connect screen
promises to prevent.

## What it costs you to run

96 requests a day. Free tier, forever.

## Deploying it, first time

From this folder:

```bash
npm install
npx wrangler login          # once per machine
npx wrangler secret put CALENDAR_CRON_SECRET
npx wrangler deploy
```

The secret must be **the same value** as `CALENDAR_CRON_SECRET` in the Pages
project's own environment, at least 32 characters or the app's gate refuses it,
and **different** from `ADS_CRON_SECRET` and `HEALTH_CRON_SECRET`. Generate it
with:

```bash
openssl rand -hex 32
```

Set it on the app side too:

```bash
cd ../../command-center/app
node scripts/cf.mjs env:set CALENDAR_CRON_SECRET <value> --secret
```

## Proving it works without waiting a quarter of an hour

```bash
curl -X POST https://hauck-calendar-cron.<your-subdomain>.workers.dev/run \
  -H "x-calendar-cron: <the secret>"
```

It answers with the run summary, for example:

```
4 blocked, 0 moved, 1 freed across 1 linked of 3 clients | failed: none
```

To watch the scheduled runs instead:

```bash
npx wrangler tail
```

## When it goes wrong

| What you see | What it means |
| --- | --- |
| `401 from the sync endpoint` | The secret here and the secret in the Pages environment differ. |
| `CALENDAR_CRON_SECRET is not set` | The `wrangler secret put` step was skipped. |
| `0 linked of N clients` | Nobody has linked a Google Calendar yet. Switch the calendar step on for a client in Fulfillment > Clients, or check their connect screen. |
| `failed: <tenant>: ...` | Google or GoHighLevel refused for that one client. The others still synced; one bad account never aborts the run. |
| Nothing at all in `wrangler tail` | The Worker is not deployed, or its cron trigger was removed. |

## Deliberately not here

No database access, no Google grant, no GoHighLevel token. The one secret it
holds triggers exactly one sync and grants nothing else, which is enforced on
the app side in `command-center/app/functions/lib/calendarCron.ts`.
