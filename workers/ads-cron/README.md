# hauck-ads-cron

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

The alarm clock for the Command Center's Meta spend snapshot.

Cloudflare Pages projects cannot carry a cron trigger, so the thing that wakes
up every night lives here, beside the app rather than inside it. It makes one
authenticated POST to `/api/admin/ads/sync?days=7` and logs the result.
Everything that decides which clients to sync, how far back, and what to do with
a broken ad account lives in the app.

## Why it has to run

The client Paid Ads Dashboard divides by ad spend for ROAS, cost per lead and
cost per booking. A stale snapshot does not blank those figures out, it makes
them quietly wrong. Before this Worker existed, nothing called the sync at all
and `meta_ad_days` sat 12 days behind.

## Why `?days=7` and not `?days=1`

Meta restates recent spend for several days after the fact. Re-pulling a
trailing week and upserting on `(tenant_id, date, ad_id)` lets each day settle
to its final figure. Pulling only yesterday would freeze every day at its first,
lowest reading.

## What it costs you to run

One request a night. Free tier, forever.

## Deploying it, first time

From this folder:

```bash
npm install
npx wrangler login          # once per machine
npx wrangler secret put ADS_CRON_SECRET
npx wrangler deploy
```

The secret must be **the same value** as `ADS_CRON_SECRET` in the Pages
project's own environment, at least 32 characters or the app's gate refuses it,
and **different** from `HEALTH_CRON_SECRET`. That one buys a read; this one
triggers a write. Generate it with:

```bash
openssl rand -hex 32
```

Set it on the app side too, using `--add` so the other secrets survive:

```bash
cd ../../command-center/app
node scripts/cf-rebind.mjs --add ADS_CRON_SECRET
```

## Proving it works without waiting until morning

The Worker exposes a manual trigger on the same code path as the cron:

```bash
curl -X POST https://hauck-ads-cron.<your-subdomain>.workers.dev/run \
  -H "x-ads-cron: <the secret>"
```

It answers with the run summary, for example:

```
412 rows across 2 clients (7d) | skipped: Made Better Landscaping Co | failed: none
```

To watch the scheduled runs instead:

```bash
npx wrangler tail
```

## When it goes wrong

| What you see | What it means |
| --- | --- |
| `401 from the sync endpoint` | The secret here and the secret in the Pages environment differ. |
| `ADS_CRON_SECRET is not set` | The `wrangler secret put` step was skipped. |
| `skipped: <client>` | That client has no `meta_ad_account_id` on its tenant row. Set it in the admin client editor. |
| `failed: <client>: ...` | Meta refused for that one account. The others still synced; one broken ad account never aborts the run. |
| `0 rows across 0 clients` | No tenant matched. Check the app actually has clients with ad accounts. |
| Nothing at all in `wrangler tail` | The Worker is not deployed, or its cron trigger was removed. |

## Deliberately not here

No database access, no Meta token, no business logic. The one secret it holds
triggers exactly one sync and grants nothing else, which is enforced on the app
side in `functions/lib/adsCron.ts`.
