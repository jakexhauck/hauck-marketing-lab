# Ad Tracker rebuild: port the Google Sheet into the app

Replaces the existing Ad Tracking surface (`docs/build-plans/admin-redesign/07-ad-tracking.md`,
branch `worktree-admin-billing-adtracking`) in full. That surface is 13 hand-typed numbers per
day. This one is derived from live Meta and GHL data with no typing at all.

Source of truth for the port:

- Google Sheet `1YYyOEp7WPN8WnRgm09DisQlnEnhnxyHjiEfNqF0enLM` ("Local Ads School: Client Lead
  Tracking Sheet"), 5 tabs.
- Make blueprints `AC: (Local Ads School) Client Meta Data Feed` and
  `AC: (Local ads School) Client leads -> Client lead tracking sheet`.

Both Make scenarios are two modules each and are replaced entirely. Neither survives this build.

---

## 1. Goal / DoD

A per-client Ad Tracking surface that reproduces the sheet's Dashboard tab: a headline KPI row
and a breakdown table pivotable by Campaign / Ad Set / Ad, over All Time / 7 / 30 / 90 days.

Done when:

- Every KPI in §3 matches the sheet's formula, verified against a hand-computed fixture.
- The breakdown pivots across all three levels off one join key.
- No field on the page is hand-typed. Status and revenue come from GHL, spend from Meta.
- A nightly job populates `meta_ad_days` and re-running it is a no-op.
- Both Make scenarios are switched off and the sheet is read-only.

---

## 2. What the sheet actually does

Five tabs, of which two hold data and one computes.

| Tab | Grain | Fed by | Replaced by |
| --- | --- | --- | --- |
| Dashboard | 1 KPI row + N breakdown rows | Formulas | The new UI |
| Lead Tracker | 1 row per lead | Make webhook + client typing | Live GHL read |
| META DATA | 1 row per ad per day | Make Meta feed | `meta_ad_days` |
| PipelineStats | 1 summary row | Formulas | Out of scope (see §10) |
| Instructions | Static | n/a | n/a |

**Lead Tracker columns A-O:** Date, Name, Email, Number, Lead Information, Status, Value, Notes,
Campaign Name, Campaign ID, Ad Set Name, Ad Set ID, Ad Name, Ad ID, GHL Contact.

Columns A-D and I-O arrive from the Make webhook. **F (Status), G (Value), H (Notes) are typed by
the client.** Column E is written by nobody in either blueprint.

**Status vocabulary (8 values, data validation on `F8:F1001`):**
`New Lead`, `No Contact`, `Booked`, `Lost`, `Sold`, `Call Again`, `Email`, `Sending Photos`.

Every KPI on the Dashboard derives from that column plus `Value`.

---

## 3. The metric definitions (the actual spec)

Transcribed from the Dashboard formulas. `Leads` counts rows with a date; the rest are
`COUNTIF`/`SUMIF` over the Status column.

| Metric | Sheet formula, in words |
| --- | --- |
| Leads | rows with a date in range |
| Pickups | Booked + Lost + Sold + Call Again + Email + Sending Photos |
| Bookings | Booked + Lost + Sold |
| Sales | Sold |
| Revenue | sum of Value where Status = Sold |
| Ad Spend | sum of META DATA spend in range |
| Pickup Rate | Pickups / Leads |
| Booking Rate | Bookings / Leads |
| Sales % | Sales / Leads |
| Close Rate | Sales / Bookings |
| ROAS | Revenue / Ad Spend |

Breakdown table adds, per row: `Spend`, `Leads`, `Bookings`, `Sales`, `Revenue`, `ROAS`,
`Cost / Lead`, `Cost / Booking`.

Two properties to preserve:

- **`Lost` counts as a Booking.** They took an appointment and did not buy. Excluding it would
  flatter Booking Rate and wreck Close Rate.
- **All rates divide by `Leads`, not by the prior step.** Only Close Rate is step-over-step.
- Every ratio guards a zero denominator and renders `-`. Roll-ups are ratios of sums, never
  averages of ratios.

---

## 4. Status: derived from GHL, never typed

Decision: **auto from GHL only.** No manual override, no status field in our database.

Live stages pulled `2026-07-19` via `ghl --location-id OznT3yyuwK3dqVXDsCaD opportunities
pipelines`. Re-pull before implementing; stage names drift.

| Live GHL stage | Pickup | Booking | Sale |
| --- | :---: | :---: | :---: |
| Sales · New Lead 🔔 | | | |
| Sales · Hot Lead 🔥 | ✓ | | |
| Sales · Phone Appointment Booked 📞 | ✓ | ✓ | |
| Sales · Estimate Scheduled 📋 | ✓ | ✓ | |
| Sales · Job Booked 💼 | ✓ | ✓ | |
| Sales · Job Completed ✅ | ✓ | ✓ | |
| Sales · Follow Up 📌 | ✓ | | |
| Sales · Long Term Nurture 🌱 | | | |
| Trash · No Answer 🤷 | | | |
| Trash · No Close ⛔ | ✓ | ✓ | |
| Trash · Phone Appointment No-Show ❌ | ✓ | ✓ | |
| Trash · Opted Out 🚫 | ✓ | | |
| Customers · One-Time Customer 1️⃣ | ✓ | ✓ | ✓ |
| Customers · Recurring Customer 🔁 | ✓ | ✓ | ✓ |

**A Sale is landing in the Customers pipeline**, either stage. Not Job Booked, not Job Completed.

Consequences, accepted:

- The tracker must read **three** pipelines (Sales, Trash, Customers) and dedupe by contact.
- Sale detection depends on a GHL automation moving the contact into Customers. If that
  automation stops firing, Sales and Revenue silently read zero. See §9 R2.
- Three sheet statuses have no GHL stage. `Call Again` maps onto Follow Up. **`Email` and
  `Sending Photos` are dropped.** They only ever affected Pickups, which Hot Lead now covers.

Map stages **by name, case-insensitively, ignoring emoji and trailing whitespace**, not by ID.
IDs are per-location and this must work for the next client. Note the live `Phone Appointment
Booked  📞` has a double space before the emoji; normalise whitespace before comparing.

---

## 5. Attribution: `attributions[]`, not custom fields

Verified against 100 live Willis contacts on `2026-07-19`.

**The `contact.utm_*` custom fields are dead.** `utm_ad_id`, `utm_adset_id`, `utm_campaign_id`,
`utm_ad`, `utm_adset`, `utm_campaign`, `utm_source`: **0 of 100 populated.** They exist in the
location's field schema and nothing writes to them. Do not use them. `functions/lib/ghl.ts`
`attributionFromCustomFields()` reads four of these and is therefore returning null in practice.

The real data is the `attributions[]` array on the contact, present on **99 of 100** contacts and
**returned by the bulk list endpoint**. No per-contact fetch. Live shape from a Facebook lead:

```json
{
  "adSource":      "facebook",
  "utmSessionSource": "Paid Social",
  "utmCampaignId": "120250713877980415",
  "utmAdId":       "120251336167710415",
  "utmCampaign":   "7/15/26 | Lead Form | Willis Windows",
  "utmMedium":     "7/15/26 | Images & Videos",
  "utmContent":    "SIGN 1 | $100 OFF | 7/15/2026",
  "isFirst":       true
}
```

**There is no ad set ID.** `mediumId` is the Facebook Page ID (`2096724421227172`), wrong shape and
constant across ads. The sheet gets Ad Set ID from the Make webhook's GHL workflow custom data,
which the contacts API does not expose.

Resolved by joining through the ad instead:

```
contact.attributions[isFirst].utmAdId  ──►  meta_ad_days.ad_id
                                              ├── adset_id, adset_name
                                              └── campaign_id, campaign_name
```

Meta's insights call at `level: ad` returns `adset_id` and `campaign_id` on every row, so one key
resolves all three pivot levels. This is strictly better than the sheet, which trusts GHL for all
three IDs independently and can therefore disagree with Meta.

**First-touch, not last.** Take the entry with `isFirst: true`; fall back to the first element if
no flag is present. The ad that acquired the lead earns the credit.

**Names are labels, IDs are keys.** `utmCampaign` / `utmMedium` / `utmContent` are free text and
drift when an ad is renamed. Join on IDs, display names from `meta_ad_days` (the snapshot's name
at the time the spend happened).

A lead with no `utmAdId` is **unattributed**: it counts in the headline KPI row and is excluded
from the breakdown. Show the unattributed count under the table so the two never look like they
disagree.

---

## 6. Data model

One new table. Leads deliberately get none.

```sql
-- NNNN_meta_ad_days.sql   (pick the number at PUSH time, see §9 R4)
create table public.meta_ad_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  date          date not null,
  ad_id         text not null,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  campaign_id   text,
  campaign_name text,
  spend         numeric(12,2) not null default 0,
  impressions   bigint        not null default 0,
  reach         bigint        not null default 0,
  link_clicks   bigint        not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, date, ad_id)
);
alter table public.meta_ad_days enable row level security;
create index meta_ad_days_tenant_date_idx on public.meta_ad_days (tenant_id, date);
```

Mirrors META DATA columns A-E and I-N. `CTR`, `CPM` and `Day` are **not** stored; the sheet
computes them as formulas and so do we, at read time.

**Leads are not stored.** GHL stays system of record. Copying opportunities into Supabase would
reintroduce exactly the drift the sheet suffers from, and status is a pure function of stage.

---

## 7. Parity with the Make scenarios

### 7A. `Client Meta Data Feed` → nightly cron

| Make | App |
| --- | --- |
| Schedule (not exported; `date_preset: yesterday` implies daily) | Nightly cron |
| FB Insights `level: ad`, `time_increment: all_days`, no limit | Same call, same level |
| 11 fields: spend, impressions, reach, inline_link_clicks, cpm, campaign/adset/ad id + name | Same, minus `cpm` |
| `addRow` → META DATA | Upsert → `meta_ad_days` |
| Sheet formulas compute CTR / Day / CPM | Computed at read time |

Five deliberate deviations, approved:

1. **Upsert, not append.** Make appends blindly; a retry or double-run double-counts spend
   silently. Upsert on `(tenant_id, date, ad_id)` makes re-runs harmless.
2. **Date from Meta's `date_start`, not `now()`.** This is a bug in the original. Make stamps
   `formatDate(now; "MM/DD/YYYY")`, the *run* date. A late run, a retry, or a midnight timezone
   crossing files the row under the wrong day and skews every date-ranged KPI. Meta returns the
   real date.
3. **Refetch a trailing 7 days, not just yesterday.** Meta revises spend and conversions after the
   fact. `date_preset: yesterday` reads each day exactly once and never corrects it. Use
   `date_preset: last_7d` with `time_increment: 1`; the upsert absorbs the overlap.
4. **Drop the duplicated columns.** The blueprint writes ad name and ad ID into both `M`/`N` and
   `O`/`P`; `O` and `P` are past the last header. Mis-wire, not a feature.
5. **Drop the fetched `cpm`.** Requested from Meta then discarded, because the sheet recomputes it.

### 7B. `Client leads -> Client lead tracking sheet` → deleted, no replacement

| Make | App |
| --- | --- |
| GHL webhook "B2B New Lead Data B2B Final Tracker" | Nothing. Reads GHL on demand |
| `addRow` name / email / phone / date | Live from opportunities + contacts |
| Writes campaign / adset / ad name + ID into `I`-`N` | From `attributions[]` + Meta join |
| Writes GHL contact URL into `O` | Built from contact ID |
| Leaves `E`, `F`, `G`, `H` for the client to type | Status from stage, Value from `monetaryValue` |

No webhook, no ingestion endpoint, no stored lead rows.

### Note on provenance

The Meta blueprint's connection is **"Sams Connection (Samuel Darby)"** and its business and ad
account are both **"PositivProfit"**. Both blueprints write to spreadsheet
`1Lc2hblxX6ATEOiO-1RT_57aOfH3_iNspK6p-2iP2dcw`, tab `📋 Pipeline`, which is neither the sheet
supplied nor its tab names. These are the course author's scenarios, not a running copy of ours.
Treat the blueprints as documentation of intent, not as a description of live behaviour.

---

## 8. Implementation plan

TDD throughout. Pure functions first with tests, then the I/O around them. Tasks 1-4 have no UI
dependency and can land independently.

### Task 1: `functions/lib/adTrackerMetrics.ts` (pure, TDD)

The whole §3 table as pure functions over plain arrays. No network, no Supabase, no dates from
the system clock (pass `now` in).

- `deriveStatus(stageName): TrackerStatus`: §4 map, name-normalised (lowercase, strip emoji,
  collapse whitespace).
- `isPickup/isBooking/isSale(status): boolean`
- `rollup(leads, spendRows): Kpis`: the 11 headline metrics.
- `breakdown(leads, spendRows, level): BreakdownRow[]`: pivot by `campaign | adset | ad`.
- `ratio(numerator, denominator): number | null`: zero denominator yields `null`, never `0`,
  never `Infinity`.

Tests must include a **fixture transcribed from the live sheet** (the three ad-set rows: spend
£1,647 / £1,357 / £1,504, leads 32 / 24 / 24, bookings 13 / 8 / 11, sales 4 / 3 / 2) asserting our
numbers equal the sheet's to the penny. Plus: zero-spend ad, zero-lead ad, lead with no `utmAdId`,
`Lost` counting as a booking, ratios-of-sums not averages-of-ratios.

### Task 2: `functions/lib/ghl.ts` additions

- Declare `attributions?: GhlAttribution[]` on the contact type. It is already on the wire and
  currently discarded.
- `firstTouchAttribution(contact): { adId, campaignId, campaignName, adName } | null`: §5 rule.
- `fetchAllContacts(ctx, { maxPages })`: bulk list, same cursor handling as
  `fetchAllOpportunities`.
- Leave `attributionFromCustomFields()` alone for now; it feeds the lead detail route. Add a
  comment recording that all four fields measured 0/100 populated on `2026-07-19`.

Tests: attribution picks `isFirst` over `isLast`; falls back to element 0; returns `null` on a
contact with an empty or absent array; ignores non-facebook `adSource`.

### Task 3: `NNNN_meta_ad_days.sql`

§6 verbatim. Apply via `npm run db:migrate`, never the SQL editor. Pick the number at push time.

### Task 4: `functions/lib/metaAdDays.ts` + nightly sync

- `fetchAdDays(ctx, { since })`: Meta insights, `level: ad`, `date_preset: last_7d`,
  `time_increment: 1`, and the 10 fields Make requested minus `cpm` (see §7A).
- `buildAdDayUpserts(rows, tenantId)`: pure, testable. Uses `row.date_start`. Clamps negatives to
  zero, rejects non-numerics, coerces PostgREST numeric-as-string.
- `syncAdDays(ctx)`: fetch, build, upsert on `tenant_id,date,ad_id`.
- Scheduled trigger, once nightly, iterating tenants with a `meta_ad_account_id`.

**Gotcha:** Cloudflare has an orphan `META_AD_ACCOUNT` binding; the code reads
`META_AD_ACCOUNT_ID`. Confirm the binding before assuming a tenant is unconfigured.

Tests: upsert is idempotent across two identical runs; the date comes from `date_start` and not
the clock; a revised spend figure overwrites rather than duplicating.

### Task 5: `functions/api/admin/clients/[tenantId]/ad-tracker.ts`

`GET ?range=all|7|30|90&level=campaign|adset|ad` → `{ kpis, breakdown, unattributed, meta }`.

Reads opportunities across Sales + Trash + Customers, dedupes by `contactId` (a contact promoted
to Customers may hold opportunities in two pipelines; the **furthest-along** wins, ordered
Sale > Booking > Pickup > Lead). Bulk-fetches contacts, joins attribution, reads `meta_ad_days`
for the range, hands both to Task 1. Ratios are computed server-side and never recomputed on the
client.

Admin-auth gated via `_middleware.ts`, service-role Supabase, as the existing ad-tracking endpoint.

### Task 6: Client: DTOs, hook, panel

- `src/lib/api.ts`: DTOs mirroring the endpoint.
- `src/hooks/useApi.ts`: `useAdminAdTrackerQuery(tenantId, range, level)`, `keepPreviousData` so
  switching range or level does not blank the table.
- `src/components/admin/cockpit/paidads/AdTrackerPanel.tsx`: KPI strip + breakdown table +
  range selector + level toggle. Replaces `AdTrackingPanel.tsx`.

Layout follows the sheet's Dashboard: a headline row, then the breakdown beneath it. No date
cursor and no per-day grid; this surface is range-based, not month-based.

### Task 7: Remove the old surface

Delete `AdTrackingPanel.tsx`, `RollingSummaryStrip.tsx`, `src/lib/adTrackingMetrics.ts` (+ tests),
`functions/lib/adTracking.ts` (+ tests), `functions/api/admin/clients/[tenantId]/ad-tracking.ts`,
and `0038_ad_tracking.sql`'s table via a follow-up drop migration. Re-point the sub-tab in
`src/lib/deliveryCockpit.ts`. `DailyTracker` and its `variant="wide"` stay; other trackers use it.

The old table has no data worth keeping (manual entry, never populated in prod).

### Task 8: Retire Make

Only after Task 6 is verified against live data:

1. Turn both scenarios off in Make (do not delete; leave them dormant for one month).
2. Set the Google Sheet to read-only and note the replacement in a banner cell.
3. Remove the GHL workflow's webhook action pointing at "B2B New Lead Data B2B Final Tracker".

---

## 9. Risks and things to confirm during the build

- **R1: Volume.** 3 of the last 100 Willis contacts came from Facebook, all dated `2026-07-18`,
  all one campaign. The surface will be correct and nearly empty. Verify against a real fixture,
  not against how full the page looks.
- **R2: Sale detection is automation-dependent.** Sales and Revenue read zero if the GHL
  automation that moves contacts into Customers stops firing. Not detectable from inside the app.
  Consider a staleness note if Bookings are non-zero and Sales are zero for 30 days.
- **R3: `monetaryValue` unverified.** The CLI's `opportunities list` sends camelCase where the v2
  API wants `location_id`, so live values were not sampled. **Confirm `monetaryValue` is actually
  populated before building the Revenue line**, or ROAS renders zero throughout. Fall back to
  `contact.closed_revenue` (TEXT, needs parsing) only if it is not.
- **R4: Migration numbering is a race.** Main stops at `0026`; the unmerged
  `worktree-admin-billing-adtracking` branch holds `0037`/`0038`. Pick the number at push time.
- **R5: Currency.** The sheet is GBP; Willis is USD. Read currency from the Meta ad account
  rather than hardcoding either.
- **R6: Attribution windows.** Meta's default attribution differs from first-touch-by-contact.
  Our numbers will not tie exactly to Ads Manager. Expected, worth a footnote in the UI.

---

## 10. Out of scope

- **PipelineStats tab.** It syncs to a "PositivProfit master dashboard", which is the course
  author's cross-client roll-up, not ours. If an agency-wide view is wanted later it belongs in
  the admin cockpit, built from `meta_ad_days` directly.
- **Lead Information (col E), Notes (col H).** Written by nobody in either blueprint. Confirm with
  Jake whether they were used before deciding they are dead.
- **Manual status override.** Explicitly rejected: auto-from-GHL only.
- **Client-facing exposure.** Admin cockpit only for v1. Client-facing Paid Ads is a separate call.
