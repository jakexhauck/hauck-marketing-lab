# Paid Ads: make the numbers literally match Meta

Status: **Phases 0, 1 and 2 built and verified on localhost, 2026-08-13. Not
deployed.** Migrations 0108 and 0109 ARE applied to the live database (additive
only). Bookings are proven against Meta's Test Events tab but **no live
conversion has been sent**. Phases 3 and 4 not started.

## Verified result

Against the live Willis account, through the real `/api/ads/tracker` endpoint,
localhost, after a 90-day backfill:

| Window | Ours | Meta |
|---|---|---|
| Last 7 days | 24 leads, $154.71 | 24 leads, $154.71 |
| Last 30 days | 51 leads, $763.70 | 51 leads, $763.70 |
| This month | 28 leads, $262.36 | 28 leads, $262.36 |

Per campaign, last 30 days, all four exact: 12 / 1 / 14 / 24 leads and
$288.18 / $64.78 / $256.03 / $154.71. The breakdown's lead column now sums to
the Results row at every level, which it could never do before.

One bug the verification caught and the plan had not predicted: every Meta
`last_Nd` preset ends YESTERDAY, so the nightly sync was never fetching today's
row at all. This month read $253.77 against Meta's $262.36. `fetchAdDays` now
uses an explicit `time_range` ending today, in the account's zone.

## The problem, precisely

Willis Windows reads "6 leads, 6 bookings" on `/marketing/paid-ads` while Ads
Manager reads something else entirely. Four separate causes, all live at once.

**1. Leads has never come from Meta.** `rollup()` in
`functions/lib/adTrackerMetrics.ts:322-347` counts GHL contacts holding an
opportunity in a lead-ish pipeline:

```ts
const inWindow = leads.filter((l) => inRange(l.createdAt, start));
const leadCount = inWindow.length;
```

Nothing filters on ad id, ad tag or Meta spend, so an organic caller counts as a
paid lead. Meanwhile the Meta lead figure is computed in a completely different
file (`adsCore.ts:329`) that this page never calls. The two numbers were never
going to agree because they were never the same measurement.

**2. Meta leads are not stored at all.** `functions/lib/metaAdDays.ts:19-30`
requests ten fields. `actions` is not one of them, and neither is `results`. The
nightly snapshot has spend, impressions, reach and link clicks, and no
conversions. There is no per-day Meta lead count anywhere in the database.

**3. The attribution window is not the account's.** Every Graph call in
`metaGraph`-land omits `use_unified_attribution_setting`, so the API returns its
own default (7-day click, 1-day view) rather than the window Ads Manager is
displaying. Same account, same day, two different totals, by design.

**4. Days are cut in UTC.** `rangeStart()` at `adTrackerMetrics.ts:290-304`
builds the boundary with `Date.UTC(...)`. Meta buckets every day in the **ad
account's** timezone. For a Central account, everything after roughly 7pm local
lands on the following day in our numbers and the previous one in Meta's. On top
of that our ranges (All / 7 / 30 / 90) are not Ads Manager's ranges, so even a
correct day boundary compares two different windows.

Separately: Bookings, Sales and Revenue cannot come from Meta at all today,
because nothing tells Meta a lead booked.

## Definition of done

Open Willis's Paid Ads dashboard on Last 30 days. Open Ads Manager on the same
account, same preset. **Leads, Spend and Cost per Lead agree to the number**, at
account level and per campaign, per ad set and per ad. Bookings appear in Ads
Manager as a Schedule conversion and the dashboard shows that same count.
Verified on localhost against the live Willis account, screenshots side by side,
before anything ships.

---

## Phase 0: probe the live API first — DONE 2026-08-13

Read-only script against Willis's `act_27110669075184924`. It settled three
unknowns and overturned one of the assumptions above, which is the whole reason
it ran first.

**Account timezone is `EST`.** Fixed UTC-5, no DST. Confirms cause 4: our
`Date.UTC` boundary is five hours out from every bucket Meta reports.

**`use_unified_attribution_setting` changes nothing on this account.** Identical
spend and identical actions with and without it, on all three presets. Cause 3
is real in principle but contributes **zero** to Willis's discrepancy. Set the
flag anyway for accounts whose setting differs from the API default, but it is
not the bug and must not be sold as part of the fix.

**The `results` field is not usable, and that overturns plan step 1.1.** At
account level it returns `[{"indicator":"mixed"}]` with no values. Worse, at
campaign level it returns a value **only for the landing-page campaign** and
nothing at all for the three Instant Form campaigns:

```
7/15/26  | Lead Form | Willis Windows            spend=$288.18  lead=12  results=0  (-)
7/15/26  | Lead Form | Willis Windows - Copy     spend=$ 64.78  lead= 1  results=0  (-)
7/24/26  | Lead Form | Willis Windows | $20/Day  spend=$256.03  lead=14  results=0  (-)
8/5/26   | LP        | Willis Windows | $20/Day  spend=$154.71  lead=24  results=24 (actions:offsite_conversion.fb_pixel_lead)
```

Storing `results` would therefore have reported 24 leads where Meta reports 51.

**The `lead` action rollup is exact.** 12 + 1 + 14 + 24 = 51, which is precisely
the account-level `lead` value for the same window. The grouped logic already
written in `adsCore.ts:67-84` is correct and is what gets reused. `results` is
not stored at all.

Component types on the account, for the record: `lead` (rollup) 51,
`onsite_web_lead` 29, `offsite_conversion.fb_pixel_lead` 29,
`onsite_conversion.lead_grouped` 22. Note `onsite_web_lead` is not currently in
`ACTION_GROUPS.parts`; it does not matter while the `lead` rollup is present,
but it belongs in the fallback list.

**What Meta actually says, last 30 days:** 51 leads, $763.70 spend, $14.97 cost
per lead. The dashboard says 6.

One paging trap found and worth not repeating: the account-level daily call
returned 30 rows against a default `limit` of 25, so a naive sum came to 30
leads and $672.05 rather than 51 and $763.70. `graphGetAll` already pages;
nothing in the build may use a bare `graphGet` for a daily series.

### The finding that outlives this plan

Three of the four campaigns are Meta **Instant Form** campaigns and produced 27
of the 51 leads for $608.99. The one landing-page campaign produced the other
24 for $154.71. The dashboard's 6 cannot be explained by the reporting bug
alone: even counting only the landing-page funnel it should read 24. **The
Instant Form leads appear never to reach a GHL pipeline at all.** That is a
delivery hole, not a reporting hole, and it is worth more than this entire
build. Raised with Jake separately; tracked here so it is not lost.

## Phase 1: Meta becomes the source of Leads

**1.1 Migration `0108_meta_ad_days_leads.sql`**
Add one column to `meta_ad_days`: `leads bigint not null default 0`, the
deduplicated `lead` rollup for that ad on that day. Not `results`, and not a
`result_indicator`: Phase 0 proved `results` reports nothing for Instant Form
campaigns and would have under-reported Willis by 27 leads. Idempotent
`alter table ... add column if not exists`.

**1.2 `functions/lib/metaAdDays.ts`**
Add `actions` to `INSIGHT_FIELDS` and pass
`use_unified_attribution_setting: "true"` on `fetchAdDays` (no effect on Willis,
correct for accounts whose setting differs). Compute the per-row lead count with
the existing grouped rollup: move `actionsValue` and `ACTION_GROUPS` out of
`adsCore.ts` into a shared module so the snapshot and the insights path cannot
drift, and add `onsite_web_lead` to the `lead` group's fallback parts. Extend
`buildAdDayUpserts` and `AD_DAY_COLUMNS`. Same rule as `metric()`: a missing
conversion is 0, a malformed one drops the row.

**1.3 Account timezone**
Fetch `timezone_name` once per sync and store it on the tenant (extend the
`agency_meta` row from 0106 rather than adding a table). Cache it; it changes
approximately never.

**1.4 `rangeStart()` cuts in the account timezone, and the ranges become Meta's**
Replace `All / 7 / 30 / 90` with Ads Manager's own presets: Today, Yesterday,
Last 7 days, Last 14 days, Last 30 days, This month, Last month, Maximum. Bound
each one the way Meta bounds it (its "Last 7 days" ends yesterday, it does not
include today) and compute the boundary with the account zone, not `Date.UTC`.
This is the change most likely to be wrong quietly, so it gets its own tests
transcribed from the Phase 0 probe table.

**1.5 `rollup()` and `breakdown()` take Leads from the spend rows**
Leads becomes `sum(results)` over `meta_ad_days` in the window, exactly like
Spend already is. The CRM lead list stays untouched and stays where it belongs,
on the Lead Tracker tab, which is a working list rather than a report. Pickups,
Bookings, Sales and Revenue keep coming from GHL until Phase 2 lands.

Consequence worth stating plainly: `unattributed` and the "Other" reconciliation
row in `adTrackerMetrics.ts:457-466` both disappear, because the Results row and
the Breakdown rows finally come from one source and cannot disagree.

**1.6 Backfill**
Run the sync at `days=90`, then a Maximum pass, so All Time is real history and
not "whatever we happened to have snapshotted".

## Phase 2: Bookings go to Meta — BUILT 2026-08-13, not yet sent live

Built, tested, and proven against Meta's Test Events tab: 8 of Willis's real
bookings accepted, 0 refused. **No live conversion has been sent yet**; that is
a one-line call away and is deliberately left as Jake's decision, because a
conversion written into a client's pixel cannot be withdrawn.

What went in:

- `0109_capi_schedule.sql`: `capi_identity` (fbc/fbp kept from the funnel
  submit, keyed by hashed email/phone), `capi_sent` (idempotency ledger keyed on
  the GHL appointment id), and `meta_ad_days.meta_bookings`.
- `lib/capiSchedule.ts`: reads the client's calendars, finds appointments
  **booked** since a cutoff (by `dateAdded`, never `startTime`), looks up the
  click signals, sends `Schedule`, records the outcome.
- `lib/capiScheduleWebhook.ts` + a hook in `api/webhook.ts`: the instant path,
  for when the GHL workflows exist.
- `api/admin/ads/capi-schedule.ts`: the polling path, which needs no GHL
  configuration at all and is what actually runs today.
- `workers/ads-cron`: now runs both jobs nightly.

Three decisions worth not re-litigating:

**The poll exists because the webhook does not fire.** Willis has never had the
GHL workflows wired; their activity log holds three test rows from June. Both
paths key on the appointment id and both consult the ledger, so running both is
safe and the second one to arrive sends nothing.

**A test run never touches the ledger.** Recording a test event would mark the
booking as reported and permanently suppress the real one: proving the wiring
works would be the thing that stopped it working.

**Meta refuses any conversion older than seven days.** So none of this can be
backfilled. Meta's Bookings figure starts at zero on the day it goes live and
fills in from there, which is why the dashboard still shows the CRM's booking
count and `meta_bookings` is only stored, not yet displayed. Flip it once a full
window has accumulated.

Known limitation on day one: `matched` was 0 on the test run, because
`capi_identity` is empty until funnel submissions start populating it. Those
events still carry hashed email and phone, which Meta accepts but attributes
less confidently. Match quality climbs as leads come through the funnel.

## Phase 2 (original plan, superseded by the above)

We already have a working Conversions API (`functions/lib/metaCapi.ts`), the
funnel already sends a Lead event with `fbc`/`fbp`, and Willis's live ad set
carries pixel `982737334630926`. Bookings is the same trick, one event later.

**2.1 Keep the click signals**
`/api/capi/lead` currently throws `fbc`/`fbp` away after sending. New table
`0109_capi_identity.sql`: tenant, hashed email, hashed phone, `fbc`, `fbp`,
first seen. That is what lets a booking made three days later still attribute to
the ad that produced it.

**2.2 `sendScheduleEvent` in `metaCapi.ts`**
`Schedule` is Meta's standard event for a booked appointment. Same hashing, same
normalisation, `event_id` = the GHL appointment id so the event is idempotent.

**2.3 Two paths in, deduped**
- Booking page beacon, the moment the calendar confirms. Highest match quality,
  real `fbc`/`fbp` from the live browser.
- GHL appointment webhook to a new `/api/capi/schedule`, for anything booked by
  phone. Hashed email and phone plus the stored signals from 2.1.

Both use the appointment id as `event_id`, so firing both is safe and Meta
counts one.

**2.4 The dashboard's Bookings reads Meta**
Once Meta counts Schedules, Bookings comes off `meta_ad_days` like Leads, and
the page matches Ads Manager on its second number. The GHL booking count stays
on the Lead Tracker, where the owner's typed status lives.

**2.5 The side benefit, which is the real prize**
The campaign can then optimise for booked appointments rather than form fills.

## Phase 3: staleness stops being invisible

`meta.lastSpendDate` is already computed and returned
(`adsTrackerResponse.ts:276`) and `DashboardSheet.tsx` never renders it. A cron
that died a month ago looks identical to a healthy one while every cost figure
drifts upward. Render "Meta data through <date>", and flag it when it is more
than two days behind.

Also confirm `workers/ads-cron` is actually deployed. It has no CI, no deploy
script, and `ADS_CRON_SECRET` is not in `doppler.yaml`. Both of its failure
modes log to console and return 200.

## Phase 4: delete the fabricated surfaces

`src/lib/adsData.ts:16` is `export const DEMO = true;` and it feeds
`/paid-ads` (`App.tsx:334`), a live URL a client can reach. `AdsOverview.tsx`,
`AdsInsights.tsx` and `AdsLeads.tsx` are unrouted and hardcode figures
(`AdsLeads.tsx:60-63`: 32 leads, 7 booked). Delete them. A page that invents
numbers is worse than no page while we are fixing the page that gets them wrong.

## Order of work

Phase 0, then 1, verify against Ads Manager on localhost and show Jake. Then 2,
verify a real Schedule lands in Events Manager Test Events before it goes live.
Then 3 and 4. Ship each phase separately, localhost verified first.
