# Paid Ads (Meta insights) — connections

The client Paid Ads tabs (Overview / Insights / Creatives / Media) over the Meta
Marketing API, plus a GHL join for the ad-revenue tiles. Read-only. The Leads tab
is wired separately (GHL, see paid-ads-sales.md). The Funnel tab stays "coming
soon" by design: it is for real landing funnels, not lead forms (Jake, 2026-07-07).

## Data source

- ✅ **Meta Marketing API** (`graph.facebook.com/v21.0`), account-level + ad-level
  insights, ported from the desktop app's `app/src-tauri/src/meta_ads.rs`
  (field lists + `CONVERSION_ACTIONS` leads parsing). Endpoint:
  `functions/api/ads/insights.ts`.
  - Overview: totals (spend, leads, cost-per-lead, impressions, reach, clicks,
    ctr, cpc) + weekly leads + running-now ads.
  - Creatives: per-ad list (name/copy/status/leads/reach/spend).
  - Insights: best ads, leads-vs-last-month, source split (publisher_platform).
- ✅ **GHL join** for "New customers", "Revenue from ads" and "Your return"
  (ROAS) on the Overview. Meta can't know which ad leads became paid jobs for a
  lead-gen business, so `functions/lib/adsRevenue.ts` counts this month's Job
  Completed opportunities whose contact carries the **`facebook ads`** tag, sums
  their opportunity `monetaryValue` (= revenue), and `roas = revenue / spend`.
  - Jake's real flow: every ad lead is tagged `facebook ads`, runs Paid Ad's
    Pipeline → Sales Pipeline, and the job value is set on the opp at Job
    Completed.
  - Sales pipeline + Job Completed stage resolved BY NAME per tenant (never by
    id). Contact tags read one contact at a time, capped at 100 newest
    completions (`truncated` flag if a client ever exceeds that; not surfaced to
    the client UI).
  - Windowed to the current month (tenant timezone) so it lines up with Meta's
    this-month spend and ROAS reads honestly. `customers`/`revenue`/`roas` are an
    honest 0/$0/0x until the first ad job completes (Jake's call: honest zeros,
    no "pending" state).
- ⚡ **Caching:** the whole payload is cached in `KV_CACHE` per
  account+location+month for 15 min (the join is several GHL round-trips).
  Skipped gracefully when no KV binding is present.
- ✅ **Media library** (`functions/api/ads/media.ts`) — the ad account's full
  image + video library via the `adimages` + `advideos` edges. Cursor-paged
  (limit 200, up to 10 pages) so a large library returns in full, not just the
  first page. Ad-account edges only, so the shared System-User token reads them
  with no extra Page grant. Client tab: `AdsMedia.tsx` / `useAdsMedia.ts`.

## Config (env-based for now)

- ⚠️ **`META_SYSTEM_USER_TOKEN`** — agency System-User token (one token spans all
  client ad accounts). SET AS A CF SECRET. Value lives in
  `app/src-tauri/src/meta_oauth_secrets.rs`.
  `node scripts/cf.mjs env:set META_SYSTEM_USER_TOKEN <token> --secret`
- ⚠️ **`META_AD_ACCOUNT_ID`** — the live client's ad account (`act_...`).
  `node scripts/cf.mjs env:set META_AD_ACCOUNT_ID act_27110669075184924`
  - Willis Windows verified: token reaches the account (HTTP 200), 0 spend / 0
    campaigns (ads not launched yet), so the tabs correctly show zeros.
- 🔜 **Per-tenant `meta_ad_account_id`** — a future `tenants` column so each client
  maps to its own account (today it's the single env account). Add the column +
  read `ctx.data.tenant.meta_ad_account_id` with the env as fallback.

## Behavior

- Env unset -> `{ configured: false }` -> tabs show the not-connected notice.
- Env set, no spend -> honest zeros + a clean, minimal empty state. The old
  "your ad account is connected, results will show up here" filler was removed
  (standing rule: a connected client never sees placeholder connection chatter,
  just the real numbers or a short empty state).
- Env set, live -> real numbers.
- Demo (`?demo=1`) -> `demoAdsInsights()` for insights; `AdsMedia` renders its own
  inline sample gallery so the layout reads without a live account.

## Known gaps (follow-ups)

- ✅ **"New customers" / ad revenue / ROAS** — DONE. Wired via the GHL join above
  (`functions/lib/adsRevenue.ts`, `facebook ads` tag → Job Completed value).
- ❌ **Real ad thumbnails** — the Creatives grid uses gradient placeholders; Meta
  `creative.thumbnail_url` is available but not hotlinked yet (CSP/format).
- ❌ **"Best time of day"** card was dropped from the real Insights view (needs an
  hourly breakdown); demo only.
- ⚠️ **Product tour** still points a step at the old synthetic `/paid-ads` raw
  dashboard (`src/lib/tourSteps.ts`); repoint it to `/marketing/paid-ads`.
- ⚠️ **Revenue window** is the current calendar month, so a job completed this
  month from an ad lead acquired earlier still counts (standard approximation).
  Revisit if Jake wants strict same-cohort attribution.

---

## Bookings reported back to Meta (Conversions API) — 2026-08-13

Meta knows what it billed for and nothing else. It reported 51 leads for Willis
in thirty days with no idea whether any of them booked, so the campaign was
optimising toward whoever filled in a form rather than whoever turned up. This
closes that loop, and it is also the only way the dashboard's Bookings figure
can ever agree with Ads Manager: Meta cannot report a conversion nobody sent it.

- ✅ **Event:** `Schedule`, one of Meta's standard events (so it can be selected
  as an ad set's optimisation goal, which a custom event cannot).
- ✅ **Pixel:** the funnel's own, from `FUNNEL_CAPI` in
  `functions/lib/metaCapi.ts`. Tenant → funnel comes from `TENANT_FUNNEL`, keyed
  by tenant slug. A client with no entry reports no bookings, deliberately:
  guessing a pixel writes a conversion into somebody else's ad account.
- ✅ **When the booking happened** is GHL's `dateAdded` on the calendar event,
  never `startTime`. An estimate booked today for next month carries a start
  time weeks in the future, which Meta rejects outright.
- ✅ **Two paths, one event.**
  - `functions/lib/capiScheduleWebhook.ts`, off `AppointmentCreate` on
    `/api/webhook`. Instant, but only for a client whose GHL workflows are wired.
    **Willis's are not** (their activity log holds three test rows from June).
  - `POST /api/admin/ads/capi-schedule`, which reads the calendars directly and
    needs no GHL configuration whatsoever. This is what actually runs, nightly,
    from `workers/ads-cron`.
  - Both key `event_id` on the GHL appointment id and both consult the
    `capi_sent` ledger, so running both counts one booking, and a re-run sends
    nothing.
- ✅ **Match quality.** `capi_identity` keeps the `fbc` (ad click) and `fbp`
  (browser) that `/api/capi/lead` used to discard, keyed by hashed email and
  phone. Meta weighs those far above hashed contact details, and without them a
  booking made days after the click is recorded but rarely attributed. The
  `matched` count in the endpoint's response is how many events carried them.
- ✅ **Cancellations** are not reported. `AppointmentCreate` only: an update is a
  reschedule of a booking Meta already counted, and the Conversions API has no
  honest way to retract one.

### Two limits worth knowing before reading the numbers

1. **Meta refuses any conversion older than seven days.** None of this is
   backfillable. Meta's Bookings figure starts at zero the day it goes live and
   fills in from there. `meta_ad_days.meta_bookings` stores it from day one so
   history accumulates, but the dashboard still shows the CRM's booking count
   until a full window exists.
2. **A test run (`?test=CODE`) never writes the ledger.** Recording a test event
   would mark that booking as reported and permanently suppress the real one.

### Proving it without inventing conversions

```
POST /api/admin/ads/capi-schedule?tenantId=<id>&days=7&test=<TEST_CODE>
```

Routes to Events Manager → Test Events instead of the live stream. Verified this
way on 2026-08-13: 8 of Willis's real bookings accepted, 0 refused, `matched` 0
(expected, `capi_identity` was still empty). Drop `&test=` to send live.

---

## What reports a Willis conversion today — 2026-08-23 audit

Four things can write into Willis's pixel `982737334630926`. Three should, one
should not, and the count in Ads Manager is wrong until the fourth is dealt
with. Audited live on 2026-08-23.

| Where | Fires | Verdict |
| --- | --- | --- |
| `quote.js` → `POST /api/capi/lead` | `Lead`, server-side, on survey submit | ✅ correct |
| GHL pixel on `/survey` | `PageView` | ✅ correct |
| GHL pixel on `/book` | `PageView` only | ✅ fixed 2026-08-23 |
| GHL calendar widget | `Schedule` on a completed booking | ✅ correct |

### The `/book` Lead was fired by loading the page, not by booking (fixed)

Navigating a fresh browser to `https://williswindows.com/book` and touching
nothing sends `ev=Lead` to the pixel four milliseconds after `ev=PageView`. No
form, no booking, no contact. GHL has `Lead` configured as a page-level event on
that funnel step, which the `eid=ob3_plugin-set_…` on the request identifies as
GHL's own pixel plugin rather than anything we wrote.

Two consequences, and the second is the worse one:

1. **Every funnel lead is counted twice.** The survey submit reports `Lead`
   server-side with a UUID `event_id`, then the redirect to `/book` fires GHL's
   browser `Lead` under a different id. Meta deduplicates only on a matching
   event name *and* event id, so it cannot collapse them.
2. **A `Lead` is recorded for anyone who merely opens `/book`** — a refresh, a
   bot, a bookmarked link, a stray click. These are conversions with no person
   attached at all.

The measured gap: 41 `Lead` events on the pixel in the seven days to 2026-08-23
against 13 rows in `capi_identity`, which is one row per real survey submission.

**Fixed 2026-08-23.** Jake turned the `Lead` event off on that funnel step in
GHL. Re-verified in a clean browser: `/book` fires `PageView` only, and the pixel
is still live on the page (`fbevents.js` and the config for the pixel both load,
so this is the event removed rather than the pixel broken).

The change was GHL page settings, never this repo. Worth remembering why it is
correct, because the objection is a fair one: somebody who reaches `/book` **has**
given their contact details, and they stay a lead in the CRM. But that Lead was
already reported server-side at submit, and this event fired on **page load** for
anyone holding the URL. It was a second copy plus phantoms, not a second lead.

If the survey-to-calendar step is ever worth measuring, give it a different event
name. Never `Lead`: that is what the ad set optimises against.

### Why GHL's two `Conversions API` workflows are not the answer

Both exist in Willis's sub-account and neither should be reconfigured to report
funnel leads:

- **`Conversions API (Lead Form)`** (`7706f1c2`) triggers on *Facebook Lead Form
  Submitted*, a Meta Instant Form. Willis runs none, so it never fires. Its
  `lead_event` action is correct for that trigger and wrong for everything else:
  `lead_id` exists only for Instant Forms. Switching it to a funnel event would
  start a third `Lead` stream on the same pixel.
- **`Conversions API (Schedules)`** (`c72a297a`) triggers on a booking in
  calendar `Jlr88qZDp0Sth1H5Sjzf` and still carries **`test_event_code:
  "TEST7647"`**, so every booking it has reported since 2026-08-13 went to Test
  Events and counted for nothing. Removing that test code does not switch GHL
  on: GHL's calendar widget already fires `Schedule` from the browser, so it
  would double-count bookings instead. Leave it test-coded or unpublish it.

### `fbclid` is persisted, so a returning homeowner still carries `fbc`

`quote.js` keeps the `fbclid` in `localStorage` under `wwq_click` alongside the
time it was **first seen**, and falls back to it when the URL no longer has one.

**`attribution()` runs on page load for this, not only at submit.** That is the
whole mechanism and it is easy to undo by accident: writing the stored click at
submit time stores it at the one moment the URL still had it, which is worth
nothing. The live smoke test caught exactly that between `201f14dd` and
`e099eeca`.

Two reasons it matters, both measured:

1. A homeowner who reloads, opens the page from a bookmark, or comes back from
   another tab has lost the parameter but still arrived from the ad. One of the
   two blank-`fbc` rows in `capi_identity` was exactly this, landing on
   `/survey-page` with no query string.
2. `fbc` is `fb.1.<ms>.<fbclid>` and Meta reads that timestamp as the moment of
   the **click**. Stamping it at submit time reported every lead as having
   clicked several minutes later than they did, because the survey takes that
   long to finish.

A `fbclid` on the URL always wins: it belongs to this visit. The same click
never restamps itself, or every reload would drag the recorded click time
further from the ad that earned it.
