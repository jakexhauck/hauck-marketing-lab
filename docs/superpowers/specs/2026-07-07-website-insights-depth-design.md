# Website Insights: more depth

Date: 2026-07-07
Status: approved design, pre-implementation

## Goal

Deepen the client app's Website Insights page (`/website` > Insights) with more of the
data a local service business owner actually cares about, using only data we can already
reach: the client's GA4 property and the existing lead pipeline. No new integrations.

Definition of done:
- The page surfaces avg time on site, total page views, engagement rate, new-vs-returning,
  device split, top towns, busiest day, a full most-visited-pages list, and a
  visitor-to-lead rate.
- All figures are real GA4 / pipeline numbers. The golden rule holds: a real connected
  client only ever sees their real numbers; any GA4 error or missing config returns
  `connected: false` and the honest empty state. Demo (`?demo=1`) shows the full designed
  layout from `SAMPLE_*` fixtures.
- `shapeAnalytics` has unit-test coverage for the new shaping.

Out of scope (confirmed, separate builds later): Google Search Console (search terms /
position) and PageSpeed / Core Web Vitals.

## Data points and their source

| Data point | Source | Notes |
| --- | --- | --- |
| Avg time on site | GA4 `averageSessionDuration` | Already fetched, shown on Overview, not Insights |
| Total page views | GA4 `screenPageViews` | Already fetched |
| Most-visited pages (full list) | GA4 `pagePath` x `screenPageViews`, top 5 | Already fetched; page renders only the #1 today |
| Engagement rate | GA4 `engagementRate` | New metric on existing KPI report |
| New vs returning | GA4 `newUsers` (+ existing `activeUsers`) | Returning = activeUsers - newUsers |
| Device split | GA4 `deviceCategory` x `activeUsers` | New report; Phone / Desktop / Tablet as % of total |
| Top towns | GA4 `city` x `activeUsers`, top 5 | New report |
| Busiest day | GA4 `dayOfWeekName` x `activeUsers` | New report; pick the day with the most |
| Visitor-to-lead rate | (estimate requests + website chats) / visitors | Computed client-side from GA4 + pipeline |

## Backend

### `functions/lib/ga4.ts`

`batchRunReports` currently sends all requests in one `:batchRunReports` call, which the
GA4 Data API caps at 5 reports. We will send 7. Teach `batchRunReports` to split the
request array into chunks of 5, run the chunks in parallel (`Promise.all`), and concatenate
the responses in original request order. Callers are unchanged; the report-order contract
`shapeAnalytics` relies on is preserved.

### `functions/api/website/analytics.ts`

Extend the `WebsiteAnalytics` interface with:

```
newUsers: number;
returningUsers: number;
engagementRate: number;          // percent, 0..100
devices: { label: string; pct: number }[];   // Phone / Desktop / Tablet
cities: { label: string; visitors: number }[]; // top 5
busiestDay: string | null;       // e.g. "Saturday"; null when no data
```

`NOT_CONNECTED` gains zeroed/empty defaults for each new field.

Reports sent to `batchRunReports` (order matters, `shapeAnalytics` destructures by index):

1. Trend (`yearMonth` x `activeUsers`) - unchanged
2. KPIs this month (metrics: `averageSessionDuration`, `screenPageViews`, `activeUsers`,
   **`newUsers`**, **`engagementRate`**) - two metrics added
3. Top pages (`pagePath` x `screenPageViews`, top 5) - unchanged
4. Sources (`sessionDefaultChannelGroup` x `sessions`) - unchanged
5. **Device** (`deviceCategory` x `activeUsers`)
6. **Cities** (`city` x `activeUsers`, ordered desc, limit 5)
7. **Busiest day** (`dayOfWeekName` x `activeUsers`)

`shapeAnalytics(reports, now)` additions:
- KPI row: read `newUsers` (index 3) and `engagementRate` (index 4). `returningUsers =
  max(0, activeUsers - newUsers)`. `activeUsers` here is the KPI report's own `activeUsers`
  metric (index 2), the month total, so the split matches the headline.
- Devices: map `deviceCategory` to friendly labels (`mobile` -> "Phone", `desktop` ->
  "Desktop", `tablet` -> "Tablet"; unknown keeps its own capitalized label), aggregate,
  convert to % of total device users, sort desc.
- Cities: map rows to `{ label, visitors }`, drop blank `(not set)` city names, top 5.
- Busiest day: pick the `dayOfWeekName` row with the highest `activeUsers`; `null` if no
  rows.
- `engagementRate` from GA4 is a 0..1 ratio; multiply by 100 and round for a percent.

Cache key and 15-min KV TTL are unchanged (the richer payload lives under the same key).

## Frontend

### `src/routes/website/shared.tsx`

Add demo fixtures + types alongside the existing `SAMPLE_*`:

```
SAMPLE_DEVICES: { label; pct }[]      // Phone 63, Desktop 31, Tablet 6
SAMPLE_CITIES: { label; visitors }[]  // e.g. Rivertown 512, Millbrook 208, ...
SAMPLE_BUSIEST_DAY: string            // "Saturday"
SAMPLE_ENGAGEMENT_RATE: number        // 58
SAMPLE_NEW_USERS / SAMPLE_RETURNING_USERS
SAMPLE_AVG_TIME_SEC / SAMPLE_PAGE_VIEWS
```

Add the matching field types to the analytics interfaces already mirrored in
`hooks/useWebsiteAnalytics.ts` (`devices`, `cities`, `busiestDay`, `newUsers`,
`returningUsers`, `engagementRate`).

### `src/routes/website/WebsiteInsights.tsx`

Layout, top to bottom (existing tone: plain English, no jargon grid):

1. Hero: visitors + trend - unchanged
2. **KPI strip** (row of stat cards): avg time on site, page views, engagement rate,
   % new visitors, **visitor-to-lead rate**
3. Engagement cards: estimate requests, website chats - unchanged
4. Row: where visitors come from (sources) | **most-visited pages** list (all 5, with views)
5. Row: **device split** (Phone / Desktop / Tablet as labeled bars or mini-stats) |
   **top towns** list
6. **Busiest-day** callout (slim card: "Saturday is your busiest day")
7. Demo takeaways - stay demo-only

Visitor-to-lead rate is computed in the component:
`rate = (estimateForm.thisMonth + chatWidget.thisMonth) / visitors * 100`.
Show the card only when both analytics and the engagement pipeline are present and
`visitors > 0`; otherwise omit the single card (never show a misleading or NaN rate). In
demo, show it from the sample estimate/chat + sample visitors.

Each new real-session block follows the existing show/empty gating: rendered when
`demo || aConnected` (GA4 blocks) or the engagement-connected gate (lead-rate), with honest
zeros / omission otherwise. No fabricated prose in a real session.

The two hardcoded demo `INSIGHTS` takeaways ("phone", "conversion") remain demo-only
editorial, but their claims are now backed by the real device-split and lead-rate cards
that render in connected sessions.

## Testing

New `functions/api/website/analytics.test.ts` (Vitest), unit-testing the pure
`shapeAnalytics`:
- Device rows -> friendly labels + percentages summing to ~100.
- Cities -> top 5, `(not set)` dropped.
- Busiest day -> the max `dayOfWeekName`; `null` on empty.
- New/returning split from KPI metrics; returning floored at 0.
- Engagement rate ratio -> percent.
- Empty reports -> zeroed/empty fields, no throw.

Build TDD-first: write the shaping tests, then extend `shapeAnalytics`.

## Risks / notes

- GA4 `city` can be `(not set)`; filtered out.
- `dayOfWeekName` localization: GA4 returns English day names for the API; safe to display
  as-is.
- Report order is load-bearing (`shapeAnalytics` destructures by index). The chunking in
  `batchRunReports` must preserve order; the test suite and a manual demo/live check cover
  it.
- Extra GA4 reports add a second batch HTTP call; result is cached 15 min per property, so
  the added latency is once-per-cache-window, immaterial.
