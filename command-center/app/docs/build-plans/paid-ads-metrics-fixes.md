# Paid Ads metrics: what was wrong and what changes

**Found 2026-08-12, diagnosing Willis Windows.** Jake said the ad metrics looked
wrong for spend, cost per lead and cost per booking. Four things were checked
against live Willis data; two are real defects, one is a presentation fault, and
one turned out to be a non-issue worth writing down so it is not re-investigated.

## 1. Every lead counted twice (real, client-facing)

`functions/lib/adsCore.ts` holds a flat `CONVERSION_ACTIONS` set and
`actionsValue()` sums the value of every action type in it. Meta does not report
disjoint action types: it reports a **roll-up** alongside the **components that
make it up**. Willis, this month, straight from the Graph API:

| action_type | value |
|---|---|
| `lead` (Meta's roll-up) | 26 |
| `offsite_conversion.fb_pixel_lead` | 22 |
| `onsite_conversion.lead_grouped` | 4 |

22 + 4 = 26. The set contains all three, so the code returned 52.

Effect on the client's Paid Ads > Overview tiles:

| Tile | Showed | Truth |
|---|---|---|
| New leads | 52 | 26 |
| Cost per lead | $4.72 | $9.44 |

Exactly double and exactly half. The same fault would triple-count purchases
(`purchase` + `omni_purchase` + `offsite_conversion.fb_pixel_purchase`) and
double-count registrations, so ROAS is exposed the moment those fire.

`actionsValue` also feeds the weekly bar chart, the per-ad lead counts, and
last month's comparison, so all of those were doubled too.

**Fix.** Replace the flat set with ordered groups. Each group names its roll-up
first: take the roll-up when Meta reports it, and only fall back to summing the
components when it is absent. Sum across groups, never within one.

## 2. Results and Breakdown do not reconcile (real, presentation)

On the Lead Tracker's Dashboard, all-time, Willis:

| | Results block | Breakdown rows |
|---|---|---|
| Ad Spend | $743.27 | $134.28 |
| Leads | 35 | 7 |

Both are behaving as written. `breakdown()` drops every campaign outside the
live one (Jake's rule of 2026-07-30: show the campaign they are paying for, not
a museum of dead creatives), while Results is the true total for the range. The
client sees two spend figures on one screen that differ by $609 and nothing
says why.

**Fix.** Keep Results as the true total: never hide spend from the person who
paid it. Give the breakdown a single aggregate **"Other campaigns"** row
covering all out-of-scope spend and leads in the range, so the rows sum to
Results exactly. The live campaign keeps its badge and its place at the top, and
no museum of dead creatives comes back.

## 3. The Results lead count includes contacts the table hides (real, small)

`buildTrackerResponse` filters internal recipients out of the lead rows
(`.filter((l) => !data.isInternal(...))`) but calls `rollup()` on the unfiltered
set. Willis: Results says 35 leads, the table lists 34. A client who counts the
rows gets a different answer from the tile above them.

**Fix.** Filter internal contacts once, before both, so the KPI row and the
table are computed from the same leads.

## 4. Cost per lead dividing by non-ad leads: not a defect

Worth recording so it is not chased again. There is **no** cost-per-lead or
cost-per-booking figure in the Results block; its columns are Leads, Pickups,
Pickup Rate, Bookings, Booking Rate, Sales, Sales %, Close Rate, Revenue, Ad
Spend, ROAS. The only cost-per-lead in the tracker is the breakdown's, and that
one already divides by ad-attributed leads only, which is correct.

The `unattributed` count the API returns is rendered in the **admin** cockpit
(`AdsDashboardPanel.tsx`) but not in the client's own `DashboardSheet`. With
fix 2 in place the rows reconcile, so the client's sheet gains the same note:
6 of Willis's 35 leads carry no ad.

## 5. Meta was told a new lead happened every time a follow-up fired

**Resolved 2026-08-12.** Jake had configured GoHighLevel's Meta Conversions API
action inside the **follow-up workflows**. He removed it the same day. Our own
funnel CAPI (`quote.js` -> `/api/capi/lead` -> `metaCapi.ts`) was never the
problem and is deliberately left in place: it is the accurate signal.

An earlier draft of this section blamed the browser pixel on the Booking step
and recommended deleting it. **That was wrong.** Acting on it would have removed
the one honest browser signal and left the real duplicate running. The evidence
that overturned it is below, kept because it is the method that found the answer.

### What the pixel received

`/{pixel}/stats` counts events as RECEIVED, per source. Pixel
`982737334630926`, per day, against contacts GHL actually created:

| date | server Lead | new GHL contacts |
|---|---|---|
| 18-28 Jul | 1-3/day | 1-5/day |
| 5 Aug | 1 | 1 |
| 8 Aug | 2 | 2 |
| 9 Aug | 3 | 2 |
| 10 Aug | 4 | 2 |
| 11 Aug | 12 | 5 |
| 12 Aug | 10 | 3 |

Through 28 July the pixel never received more server events than contacts
created. The divergence starts 9-10 August and then accelerates.

**The accelerating shape is what identified the cause.** A duplicate firing at
lead creation sits at a flat 2x. This climbed against a roughly flat lead count,
because follow-up workflows fire on a delay for contacts created on earlier
days: as the backlog in the sequences grows, so does the daily event count.
Hence 12 events from 5 new leads, and single hours carrying 4 events for one
contact.

Browser events were a red herring throughout: `Schedule` fires browser-side on
the Thank You step, so browser `Lead` was 22 - 21 = **1** for the whole week.

### Ruled out before landing on the workflows

- **Our funnel beacon.** `reportConversion` has one call site, fires only after
  GHL returns ok, and memoises `event_id` per page load. `render()` reassigns
  `slot.innerHTML`, so the two `addEventListener("submit", ...)` calls in
  `bind()` attach to freshly built forms; the address branch returns before the
  contact branch. No listener accumulation.
- **Our server.** `sendLeadEvent` posts one event per request, no retry.
- **The transport.** `POST /api/capi/lead` answers 403 with zero redirects for a
  missing or foreign Origin, so no beacon replay.
- **A second copy of our script.** `/survey` loads `quote.js` once; `/book`
  loads only `booking.js` and `/thank-you-quote` only `thanks.js`, neither
  carrying a CAPI call.

### Why it mattered beyond reporting

The ad set's `custom_event_type` is LEAD on this pixel, so Meta was optimising
against a signal that fired hardest for the people who did NOT convert: those
are the ones chased hardest by follow-ups. The campaign was being taught to buy
traffic that generates follow-ups.

Never send `Lead` from a follow-up step. A follow-up is not a conversion, and
the conversion is already reported once, by the funnel, at the moment it
happens. If deeper funnel steps are worth reporting, use a different event name
(`Schedule`, `Contact`, or a custom one) and never the one the ad set optimises
against.

The CRM was correct throughout. Only Meta's view was polluted, which is why the
tracker's own lead counts were right all along.

### Still to verify (next session)

12 August's totals still contain events fired before the action was removed, so
they prove nothing. From **13 August** onward, server Lead events should be at
or below new GHL contacts per day, as they were in July. Re-run the per-day
comparison to confirm.

Cost per lead will RISE once this settles, and the higher figure is the true
one. Section 1 fixed the Command Center's arithmetic; it could not fix the
pixel's input.
## Files

| File | Change |
|---|---|
| `functions/lib/adsCore.ts` | `CONVERSION_ACTIONS` set -> roll-up groups; `actionsValue` de-duplicates |
| `functions/lib/adsCore.test.ts` | roll-up-wins and fall-back-to-components cases |
| `functions/lib/adTrackerMetrics.ts` | `breakdown()` gains the "Other campaigns" aggregate row |
| `functions/lib/adTrackerMetrics.test.ts` | breakdown rows reconcile to rollup spend |
| `functions/lib/adsTrackerResponse.ts` | filter internal contacts before `rollup()` |
| `src/components/ads/tracker/DashboardSheet.tsx` | unattributed note on the client's sheet |

## Done when

- The Overview shows 26 leads and $9.44 cost per lead for Willis this month.
- The breakdown's spend column sums to the Results Ad Spend figure.
- Results Leads equals the number of rows in the Lead Tracker table.
- `npm test` and `npm run typecheck` pass.
- Verified on localhost against real Willis data before anything ships.
