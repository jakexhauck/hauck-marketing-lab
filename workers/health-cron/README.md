# hauck-health-cron

The alarm clock for the Command Center's connection health check.

Cloudflare Pages projects cannot carry a cron trigger, so the thing that wakes
up every 30 minutes lives here, beside the app rather than inside it. It makes
one authenticated GET to `/api/admin/connections/health` and logs the result.
Everything that decides what "broken" means, what changed since the last run,
and who gets notified lives in the app, where it is unit tested.

## What it costs you to run

One request every 30 minutes: 48 a day, comfortably inside the free tier.

## Deploying it, first time

From this folder:

```bash
npm install
npx wrangler login          # once per machine
npx wrangler secret put HEALTH_CRON_SECRET
npx wrangler deploy
```

The secret must be **the same value** as `HEALTH_CRON_SECRET` in the Pages
project's own environment, and at least 32 characters or the app's gate refuses
it. Generate one with:

```bash
openssl rand -hex 32
```

Set it on the app side too, using `--add` so the other secrets survive:

```bash
cd ../../command-center/app
node scripts/cf-rebind.mjs --add HEALTH_CRON_SECRET
```

## Proving it works without waiting half an hour

The Worker exposes a manual trigger on the same code path as the cron:

```bash
curl -X POST https://hauck-health-cron.<your-subdomain>.workers.dev/run \
  -H "x-health-cron: <the secret>"
```

It answers with the run summary, for example:

```
checked 21 connections | broke: none | recovered: none | notified 0 devices
```

To watch the scheduled runs instead:

```bash
npx wrangler tail
```

## When it goes wrong

| What you see | What it means |
| --- | --- |
| `401 from the health endpoint` | The secret here and the secret in the Pages environment differ. |
| `HEALTH_CRON_SECRET is not set` | The `wrangler secret put` step was skipped. |
| `the app recorded nothing` | The request reached the app but did not pass the cron gate. Check the secret is 32+ chars: a shorter one is refused rather than accepted. |
| Nothing at all in `wrangler tail` | The Worker is not deployed, or its cron trigger was removed. |

The app watches this Worker back: Agency Settings has a **Scheduled health
checks** row that goes red when the last recorded run is more than 90 minutes
old. A watchdog nobody watches is just a cron job.

## Deliberately not here

No database access, no vendor tokens, no business logic. The one secret it holds
buys exactly one read-only snapshot and grants nothing else, which is enforced on
the app side in `functions/lib/healthCron.ts`.
