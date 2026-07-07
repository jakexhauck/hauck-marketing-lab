# Website Insights Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the client app's Website Insights page with more GA4 + pipeline data (device split, new/returning, engagement rate, top towns, busiest day, full page list, visitor-to-lead rate).

**Architecture:** Extend the existing GA4 read path (`functions/api/website/analytics.ts` shaping the Data API into `WebsiteAnalytics`) with more reports and fields, teach `batchRunReports` to chunk past GA4's 5-report cap, then surface the new fields on `WebsiteInsights.tsx` with matching `SAMPLE_*` demo fixtures. Visitor-to-lead rate is computed client-side from GA4 visitors + the existing engagement pipeline.

**Tech Stack:** TypeScript, Cloudflare Pages Functions (Workers runtime), React, Vitest, Tailwind.

## Global Constraints

- Golden rule: a real connected client only ever sees their real numbers. Any GA4 error or missing config returns `connected: false` and the honest empty state. Never a fabricated number in a real session. Demo (`?demo=1`) shows the full designed layout from `SAMPLE_*` fixtures.
- Never use em dashes anywhere (code comments, UI copy, docs). Use commas, periods, parentheses, or colons.
- Plain-English labels for a local business owner. No analytics jargon dumps.
- GA4 report order is load-bearing: `shapeAnalytics` destructures reports by index. Any change to report order must update `shapeAnalytics` in lockstep.
- Test runner: `npm test` (which is `vitest run`) from `command-center/app`.
- Typecheck: `npm run typecheck` from `command-center/app` (runs both app and functions tsconfig).

---

### Task 1: Chunk GA4 reports past the 5-report cap

**Files:**
- Modify: `command-center/app/functions/lib/ga4.ts`
- Test: `command-center/app/functions/lib/ga4.test.ts` (create)

**Interfaces:**
- Produces: `export function chunk<T>(items: T[], size: number): T[][]` and an unchanged public signature `batchRunReports(sa, propertyId, requests): Promise<ReportResponse[]>` that now accepts more than 5 requests and returns responses in request order.

- [ ] **Step 1: Write the failing test**

Create `command-center/app/functions/lib/ga4.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunk } from "./ga4";

describe("chunk", () => {
  it("splits into groups of at most size, preserving order", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
  });

  it("returns a single group when under the size", () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd command-center/app && npx vitest run functions/lib/ga4.test.ts`
Expected: FAIL, `chunk` is not exported / not a function.

- [ ] **Step 3: Implement chunking and refactor `batchRunReports`**

In `command-center/app/functions/lib/ga4.ts`, add a `chunk` helper (place it above `batchRunReports`):

```ts
// Split an array into groups of at most `size`, preserving order. Used to keep
// GA4 batchRunReports calls within the Data API's 5-reports-per-call cap.
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

Replace the existing `batchRunReports` function body so it mints the token once, splits the requests into chunks of 5, runs the chunks in parallel, and concatenates the results in order:

```ts
// Run one chunk of <=5 reports in a single :batchRunReports call.
async function runReportChunk(
  token: string,
  propertyId: string,
  requests: ReportRequest[],
): Promise<ReportResponse[]> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GA4 batchRunReports failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { reports?: ReportResponse[] };
  return json.reports ?? [];
}

// Run several GA4 reports and return them in request order. The Data API caps
// batchRunReports at 5 reports per call, so we chunk into groups of 5, run the
// chunks in parallel, and concatenate the responses in order.
export async function batchRunReports(
  sa: ServiceAccount,
  propertyId: string,
  requests: ReportRequest[],
): Promise<ReportResponse[]> {
  const token = await mintToken(sa);
  const groups = chunk(requests, 5);
  const results = await Promise.all(groups.map((g) => runReportChunk(token, propertyId, g)));
  return results.flat();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd command-center/app && npx vitest run functions/lib/ga4.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/lib/ga4.ts command-center/app/functions/lib/ga4.test.ts
git commit -m "feat(website): chunk GA4 reports past the 5-per-call cap"
```

---

### Task 2: Shape the new GA4 metrics and dimensions

**Files:**
- Modify: `command-center/app/functions/api/website/analytics.ts`
- Test: `command-center/app/functions/api/website/analytics.test.ts` (create)

**Interfaces:**
- Consumes: `batchRunReports` (Task 1), `ReportResponse` from `../../lib/ga4`.
- Produces: extended `WebsiteAnalytics` with `newUsers: number`, `returningUsers: number`, `engagementRate: number`, `devices: { label: string; pct: number }[]`, `cities: { label: string; visitors: number }[]`, `busiestDay: string | null`; and an updated `shapeAnalytics(reports: ReportResponse[], now: Date): WebsiteAnalytics` that reads 7 reports in order `[trend, kpi, pages, sources, device, city, day]`.

- [ ] **Step 1: Write the failing tests**

Create `command-center/app/functions/api/website/analytics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shapeAnalytics } from "./analytics";
import type { ReportResponse } from "../../lib/ga4";

// Helper: a report of rows, each [dimValues[], metricValues[]].
function report(rows: [string[], string[]][]): ReportResponse {
  return {
    rows: rows.map(([dims, mets]) => ({
      dimensionValues: dims.map((value) => ({ value })),
      metricValues: mets.map((value) => ({ value })),
    })),
  };
}

const NOW = new Date("2026-07-15T12:00:00Z");

// A full 7-report fixture in the order shapeAnalytics expects.
function reports(): ReportResponse[] {
  return [
    // 0 trend: yearMonth x activeUsers
    report([[["202606"], ["1148"]], [["202607"], ["1240"]]]),
    // 1 kpi: avgSessionDuration, screenPageViews, activeUsers, newUsers, engagementRate
    report([[[], ["72", "3120", "1240", "892", "0.58"]]]),
    // 2 pages: pagePath x screenPageViews
    report([[["/services"], ["412"]], [["/"], ["388"]]]),
    // 3 sources: channelGroup x sessions
    report([[["Organic Search"], ["600"]], [["Direct"], ["400"]]]),
    // 4 device: deviceCategory x activeUsers
    report([[["mobile"], ["780"]], [["desktop"], ["380"]], [["tablet"], ["80"]]]),
    // 5 city: city x activeUsers
    report([[["Rivertown"], ["512"]], [["(not set)"], ["300"]], [["Millbrook"], ["208"]]]),
    // 6 day: dayOfWeek (0=Sun..6=Sat) x activeUsers
    report([[["0"], ["120"]], [["6"], ["300"]], [["3"], ["150"]]]),
  ];
}

describe("shapeAnalytics new fields", () => {
  it("splits new vs returning from the KPI report", () => {
    const a = shapeAnalytics(reports(), NOW);
    expect(a.newUsers).toBe(892);
    expect(a.returningUsers).toBe(1240 - 892);
  });

  it("floors returning at zero when newUsers exceeds activeUsers", () => {
    const r = reports();
    r[1] = report([[[], ["72", "3120", "100", "500", "0.4"]]]);
    expect(shapeAnalytics(r, NOW).returningUsers).toBe(0);
  });

  it("converts engagement rate ratio to a whole percent", () => {
    expect(shapeAnalytics(reports(), NOW).engagementRate).toBe(58);
  });

  it("labels devices and converts to percentages, sorted desc", () => {
    const a = shapeAnalytics(reports(), NOW);
    expect(a.devices).toEqual([
      { label: "Phone", pct: 63 },
      { label: "Desktop", pct: 31 },
      { label: "Tablet", pct: 6 },
    ]);
  });

  it("drops (not set) cities and keeps the rest in order", () => {
    const a = shapeAnalytics(reports(), NOW);
    expect(a.cities).toEqual([
      { label: "Rivertown", visitors: 512 },
      { label: "Millbrook", visitors: 208 },
    ]);
  });

  it("picks the busiest day by name", () => {
    expect(shapeAnalytics(reports(), NOW).busiestDay).toBe("Saturday");
  });

  it("returns empty/zeroed new fields when reports are empty", () => {
    const a = shapeAnalytics([], NOW);
    expect(a.newUsers).toBe(0);
    expect(a.returningUsers).toBe(0);
    expect(a.engagementRate).toBe(0);
    expect(a.devices).toEqual([]);
    expect(a.cities).toEqual([]);
    expect(a.busiestDay).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd command-center/app && npx vitest run functions/api/website/analytics.test.ts`
Expected: FAIL (properties `newUsers`, `devices`, etc. do not exist on the result).

- [ ] **Step 3: Extend the interface and NOT_CONNECTED**

In `command-center/app/functions/api/website/analytics.ts`, add the new fields to the `WebsiteAnalytics` interface, right after `deltaPct`:

```ts
  // Split of this month's active users into first-time and returning.
  newUsers: number;
  returningUsers: number;
  // Share of engaged sessions, 0..100 (GA4 engagementRate x 100).
  engagementRate: number;
  // Device mix, as % of active users. Phone / Desktop / Tablet, sorted desc.
  devices: { label: string; pct: number }[];
  // Top towns visitors come from this month (blank / "(not set)" dropped).
  cities: { label: string; visitors: number }[];
  // The busiest day of the week this month, e.g. "Saturday". Null when no data.
  busiestDay: string | null;
```

Add the same fields to the `NOT_CONNECTED` constant:

```ts
  newUsers: 0,
  returningUsers: 0,
  engagementRate: 0,
  devices: [],
  cities: [],
  busiestDay: null,
```

- [ ] **Step 4: Add label maps and shaping**

Add these helpers near `channelLabel` / `pageLabel`:

```ts
// GA4 dayOfWeek is 0..6 with 0 = Sunday. Map to a day name we display as-is.
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// GA4 deviceCategory -> plain-English label a business owner reads.
function deviceLabel(cat: string): string {
  switch (cat) {
    case "mobile":
      return "Phone";
    case "desktop":
      return "Desktop";
    case "tablet":
      return "Tablet";
    default:
      return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Other";
  }
}
```

In `shapeAnalytics`, change the destructure to include the three new reports:

```ts
  const [trendR, kpiR, pagesR, srcR, deviceR, cityR, dayR] = reports;
```

Extend the KPI block (it currently reads only `avgTimeOnSiteSec` and `pageViews`) to also read active users, new users, and engagement rate:

```ts
  // KPI report: averageSessionDuration, screenPageViews, activeUsers, newUsers,
  // engagementRate.
  const kpiRow = kpiR?.rows?.[0]?.metricValues ?? [];
  const avgTimeOnSiteSec = Math.round(num(kpiRow[0]?.value));
  const pageViews = Math.round(num(kpiRow[1]?.value));
  const activeUsers = Math.round(num(kpiRow[2]?.value));
  const newUsers = Math.round(num(kpiRow[3]?.value));
  const returningUsers = Math.max(0, activeUsers - newUsers);
  const engagementRate = Math.round(num(kpiRow[4]?.value) * 100);
```

Add the device, city, and busiest-day shaping (place after the traffic-sources block, before the `return`):

```ts
  // Device mix: friendly labels, aggregated to % of active users, sorted desc.
  const deviceRows = (deviceR?.rows ?? []).map((row) => ({
    label: deviceLabel(row.dimensionValues?.[0]?.value ?? ""),
    users: num(row.metricValues?.[0]?.value),
  }));
  const deviceTotal = deviceRows.reduce((sum, d) => sum + d.users, 0);
  const devices =
    deviceTotal > 0
      ? deviceRows
          .map((d) => ({ label: d.label, pct: Math.round((d.users / deviceTotal) * 100) }))
          .sort((a, b) => b.pct - a.pct)
      : [];

  // Top towns, blank / "(not set)" dropped, top 5.
  const cities = (cityR?.rows ?? [])
    .map((row) => ({
      label: row.dimensionValues?.[0]?.value ?? "",
      visitors: num(row.metricValues?.[0]?.value),
    }))
    .filter((c) => c.label && c.label !== "(not set)")
    .slice(0, 5);

  // Busiest day of the week: the dayOfWeek bucket with the most active users.
  let busiestDay: string | null = null;
  let bestDayUsers = -1;
  for (const row of dayR?.rows ?? []) {
    const idx = Number(row.dimensionValues?.[0]?.value);
    const users = num(row.metricValues?.[0]?.value);
    if (Number.isInteger(idx) && idx >= 0 && idx <= 6 && users > bestDayUsers) {
      bestDayUsers = users;
      busiestDay = DAY_NAMES[idx];
    }
  }
```

Add the new fields to the returned object (alongside the existing ones):

```ts
    newUsers,
    returningUsers,
    engagementRate,
    devices,
    cities,
    busiestDay,
```

- [ ] **Step 5: Send the new reports**

In `onRequestGet`, extend the `batchRunReports` request array. Add the two new metrics to the existing KPI report and append the three new reports after the sources report:

Update the KPI report metrics to:

```ts
      // KPIs this month.
      {
        dateRanges: [thisMonth],
        metrics: [
          { name: "averageSessionDuration" },
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "engagementRate" },
        ],
      },
```

Append after the traffic-sources report object (keeping order trend, kpi, pages, sources, device, city, day):

```ts
      // Device mix this month.
      {
        dateRanges: [thisMonth],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
      },
      // Top towns this month (limit high, then filter "(not set)" in shaping).
      {
        dateRanges: [thisMonth],
        dimensions: [{ name: "city" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 8,
      },
      // Visits by day of week this month.
      {
        dateRanges: [thisMonth],
        dimensions: [{ name: "dayOfWeek" }],
        metrics: [{ name: "activeUsers" }],
      },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd command-center/app && npx vitest run functions/api/website/analytics.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add command-center/app/functions/api/website/analytics.ts command-center/app/functions/api/website/analytics.test.ts
git commit -m "feat(website): shape device, city, day, new/returning, engagement rate from GA4"
```

---

### Task 3: Frontend data contract and demo fixtures

**Files:**
- Modify: `command-center/app/src/hooks/useWebsiteAnalytics.ts`
- Modify: `command-center/app/src/routes/website/shared.tsx`

**Interfaces:**
- Consumes: the extended `WebsiteAnalytics` shape from Task 2.
- Produces: `WebsiteAnalytics` (hook) gains `newUsers`, `returningUsers`, `engagementRate`, `devices: { label: string; pct: number }[]`, `cities: { label: string; visitors: number }[]`, `busiestDay: string | null`. New exports from `shared.tsx`: `DeviceSplit`, `CityVisitors`, `SAMPLE_DEVICES`, `SAMPLE_CITIES`, `SAMPLE_BUSIEST_DAY`, `SAMPLE_ENGAGEMENT_RATE`, `SAMPLE_NEW_USERS`, `SAMPLE_RETURNING_USERS`, `SAMPLE_AVG_TIME_SEC`, `SAMPLE_PAGE_VIEWS`.

- [ ] **Step 1: Extend the hook interface**

In `command-center/app/src/hooks/useWebsiteAnalytics.ts`, add the new fields to the `WebsiteAnalytics` interface, after `deltaPct`:

```ts
  newUsers: number;
  returningUsers: number;
  engagementRate: number;
  devices: { label: string; pct: number }[];
  cities: { label: string; visitors: number }[];
  busiestDay: string | null;
```

- [ ] **Step 2: Add demo fixtures and types to shared.tsx**

In `command-center/app/src/routes/website/shared.tsx`, add near the other `SAMPLE_*` fixtures (after `SAMPLE_CHAT_WIDGET`):

```ts
// Device mix (Insights). Real sessions read WebsiteAnalytics.devices from GA4.
export interface DeviceSplit {
  label: string;
  pct: number;
}
export const SAMPLE_DEVICES: DeviceSplit[] = [
  { label: "Phone", pct: 63 },
  { label: "Desktop", pct: 31 },
  { label: "Tablet", pct: 6 },
];

// Top towns (Insights). Real sessions read WebsiteAnalytics.cities from GA4.
export interface CityVisitors {
  label: string;
  visitors: number;
}
export const SAMPLE_CITIES: CityVisitors[] = [
  { label: "Rivertown", visitors: 512 },
  { label: "Millbrook", visitors: 208 },
  { label: "Fairview", visitors: 156 },
  { label: "Oakdale", visitors: 121 },
  { label: "Lakeside", visitors: 88 },
];

// Scalar Insights fixtures (demo only). Real values come from WebsiteAnalytics.
export const SAMPLE_BUSIEST_DAY = "Saturday";
export const SAMPLE_ENGAGEMENT_RATE = 58;
export const SAMPLE_NEW_USERS = 892;
export const SAMPLE_RETURNING_USERS = 348;
export const SAMPLE_AVG_TIME_SEC = 72;
export const SAMPLE_PAGE_VIEWS = 3120;
```

- [ ] **Step 3: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/hooks/useWebsiteAnalytics.ts command-center/app/src/routes/website/shared.tsx
git commit -m "feat(website): add Insights data contract + demo fixtures for new metrics"
```

---

### Task 4: Render the deeper Insights layout

**Files:**
- Modify: `command-center/app/src/routes/website/WebsiteInsights.tsx`

**Interfaces:**
- Consumes: the extended `useWebsiteAnalytics` data (Task 3), `formatDuration` from `../../hooks/useWebsiteAnalytics`, and the new `SAMPLE_*` fixtures from `./shared`.

- [ ] **Step 1: Update imports**

In `command-center/app/src/routes/website/WebsiteInsights.tsx`, replace the icon import line to add the icons used below, and import `formatDuration` + the new fixtures.

Change the lucide import to:

```ts
import {
  Search,
  Smartphone,
  BarChart3,
  FileText,
  MessagesSquare,
  Clock,
  Eye,
  UserPlus,
  Repeat,
  Target,
  Monitor,
  MapPin,
  CalendarDays,
} from "lucide-react";
```

Add `formatDuration` to the analytics hook import:

```ts
import { useWebsiteAnalytics, formatDuration } from "../../hooks/useWebsiteAnalytics";
```

Add the new fixtures to the `./shared` import (append to the existing named import list). Note `SAMPLE_TOP_PAGES` is included here because the most-visited-pages list (Step 4) needs it and the current file does not import it yet:

```ts
  SAMPLE_TOP_PAGES,
  SAMPLE_DEVICES,
  SAMPLE_CITIES,
  SAMPLE_BUSIEST_DAY,
  SAMPLE_ENGAGEMENT_RATE,
  SAMPLE_NEW_USERS,
  SAMPLE_RETURNING_USERS,
  SAMPLE_AVG_TIME_SEC,
  SAMPLE_PAGE_VIEWS,
  type DeviceSplit,
  type CityVisitors,
```

- [ ] **Step 2: Resolve the new values in the component**

In `WebsiteInsights()`, after the existing `const topPage = ...` line, add:

```ts
  // New Insights values: demo shows fixtures, a connected session shows GA4, an
  // unconnected real session shows zeros / empties (never fabricated).
  const avgTimeSec = demo ? SAMPLE_AVG_TIME_SEC : aConnected ? a!.avgTimeOnSiteSec : 0;
  const pageViews = demo ? SAMPLE_PAGE_VIEWS : aConnected ? a!.pageViews : 0;
  const engagementRate = demo ? SAMPLE_ENGAGEMENT_RATE : aConnected ? a!.engagementRate : 0;
  const newUsers = demo ? SAMPLE_NEW_USERS : aConnected ? a!.newUsers : 0;
  const returningUsers = demo ? SAMPLE_RETURNING_USERS : aConnected ? a!.returningUsers : 0;
  const devices: DeviceSplit[] = demo ? SAMPLE_DEVICES : aConnected ? a!.devices : [];
  const cities: CityVisitors[] = demo ? SAMPLE_CITIES : aConnected ? a!.cities : [];
  const busiestDay = demo ? SAMPLE_BUSIEST_DAY : aConnected ? a!.busiestDay : null;

  // Most-visited pages: a normalized { label, views }[] for the list panel.
  const topPagesList: { label: string; views: number }[] = demo
    ? SAMPLE_TOP_PAGES.map((p) => ({ label: p.name, views: p.views }))
    : aConnected
      ? (a?.topPages ?? []).map((p) => ({ label: p.label, views: p.views }))
      : [];

  // Share of visitors who are first-time.
  const totalUsers = newUsers + returningUsers;
  const newPct = totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100) : 0;

  // Visitor-to-lead rate: needs both GA4 visitors and the lead pipeline. Null
  // (card hidden) when either is missing or there are no visitors yet.
  const leadsTotal = estimateForm.thisMonth + chatWidget.thisMonth;
  const leadRate =
    show && engagementShow && visitors > 0 ? (leadsTotal / visitors) * 100 : null;
```

`SAMPLE_TOP_PAGES` was added to the `./shared` import in Step 1. Note the `topPagesList` above replaces the old single `topPage` usage: the existing `const topPage = aConnected ? a?.topPage ?? null : null;` line becomes unused after Step 4 removes the top-performing-page card, and `noUnusedLocals` is on, so delete that `const topPage` line in this step.

- [ ] **Step 3: Add the KPI strip after the hero Panel**

Immediately after the hero `</Panel>` (the block ending the "Visitors this month" panel) and before the engagement `{engagementShow && (` block, insert:

```tsx
        {/* KPI strip: the plain-English numbers behind the headline. */}
        {show && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard icon={Clock} label="Avg time on site" value={formatDuration(avgTimeSec)} />
            <KpiCard icon={Eye} label="Page views" value={pageViews.toLocaleString()} />
            <KpiCard icon={Target} label="Engaged visitors" value={`${engagementRate}%`} />
            <KpiCard icon={UserPlus} label="New visitors" value={`${newPct}%`} />
            {leadRate != null && (
              <KpiCard
                icon={Repeat}
                label="Visitors who reached out"
                value={`${leadRate.toFixed(1)}%`}
                brand
              />
            )}
          </div>
        )}
```

- [ ] **Step 4: Replace the top-page card with a most-visited-pages list**

Find the second column of the "Sources + top performing page" grid: the `<Panel>` with `style={{ background: "var(--grad-brand)" }}` containing "Top performing page". Replace that entire `<Panel>...</Panel>` with a most-visited-pages list panel:

```tsx
              <Panel className="p-5">
                <h3 className="mb-4 font-display text-[15px] text-text">Most-visited pages</h3>
                {topPagesList.length > 0 ? (
                  <ul className="flex flex-col">
                    {topPagesList.map((p, i) => (
                      <li
                        key={`${p.label}-${i}`}
                        className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                      >
                        <span className="flex items-center gap-2.5 text-[13.5px] text-text">
                          <span className="font-data text-[12px] tnum text-faint">{i + 1}</span>
                          {p.label}
                        </span>
                        <span className="font-data text-[13px] font-semibold tnum text-muted">
                          {p.views.toLocaleString()} views
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No page views recorded yet this month.</p>
                )}
              </Panel>
```

- [ ] **Step 5: Add the device + towns row and the busiest-day callout**

Directly after the closing `</div>` of the "Sources + top performing page" grid (the `grid ... lg:grid-cols-2` block), and before the demo-only takeaways block, insert:

```tsx
            {/* Devices + top towns. */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel className="p-5">
                <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
                  <Monitor size={16} className="text-brand" />
                  What people visit on
                </h3>
                {devices.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {devices.map((d) => (
                      <div key={d.label}>
                        <div className="mb-1.5 flex items-center justify-between text-[13px]">
                          <span className="text-text">{d.label}</span>
                          <span className="font-data font-semibold tnum text-muted">{d.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.pct}%`, background: "var(--grad-brand)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">No device data yet this month.</p>
                )}
              </Panel>

              <Panel className="p-5">
                <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
                  <MapPin size={16} className="text-brand" />
                  Where your visitors are
                </h3>
                {cities.length > 0 ? (
                  <ul className="flex flex-col">
                    {cities.map((c, i) => (
                      <li
                        key={`${c.label}-${i}`}
                        className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                      >
                        <span className="text-[13.5px] text-text">{c.label}</span>
                        <span className="font-data text-[13px] font-semibold tnum text-muted">
                          {c.visitors.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No location data yet this month.</p>
                )}
              </Panel>
            </div>

            {/* Busiest day callout. */}
            {busiestDay && (
              <Panel className="mt-4 flex items-center gap-3 p-5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-tint text-brand-text">
                  <CalendarDays size={19} />
                </div>
                <div className="text-[14px] text-text">
                  <span className="font-semibold">{busiestDay}</span> is your busiest day. It is a
                  good day to post and to be ready for calls.
                </div>
              </Panel>
            )}
```

- [ ] **Step 6: Add the `KpiCard` helper component**

At the bottom of the file (next to the existing `EngagementCard` helper), add:

```tsx
// A single KPI-strip stat: an icon, a big number, and a plain-English label.
function KpiCard({
  icon: Icon,
  label,
  value,
  brand,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  brand?: boolean;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Icon size={15} className={brand ? "shrink-0 text-brand" : "shrink-0 text-faint"} />
        <span>{label}</span>
      </div>
      <div
        className={`mt-2 font-display text-[24px] font-black leading-none tracking-tight tnum ${
          brand ? "text-brand-text" : "text-text"
        }`}
      >
        {value}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd command-center/app && npm run typecheck`
Expected: no errors. If an icon import is unused (e.g. `Smartphone` was already imported and is still used by the demo takeaways), leave it; remove any genuinely unused import the compiler flags.

- [ ] **Step 8: Build**

Run: `cd command-center/app && npm run build`
Expected: build succeeds.

- [ ] **Step 9: Visual proof (demo mode)**

Run the app and screenshot the Website Insights page in demo mode to confirm the new sections render:
- Start the dev server: `cd command-center/app && npm run dev`
- Open the client Website Insights route with `?demo=1` (e.g. `http://localhost:5173/website?demo=1`, Insights tab).
- Confirm visible: KPI strip (5 cards incl. "Visitors who reached out"), most-visited pages list, device split bars, top towns list, busiest-day callout.
- Capture a screenshot with Playwright for the record.

- [ ] **Step 10: Commit**

```bash
git add command-center/app/src/routes/website/WebsiteInsights.tsx
git commit -m "feat(website): deeper Insights layout (KPIs, pages, devices, towns, busiest day)"
```

---

## Verification (whole feature)

- [ ] Run the full test suite: `cd command-center/app && npm test` — all pass.
- [ ] Typecheck clean: `cd command-center/app && npm run typecheck`.
- [ ] Build clean: `cd command-center/app && npm run build`.
- [ ] Demo screenshot captured showing every new block.
- [ ] Confirm a real UNconnected session still shows the honest empty state (no fabricated numbers): the `!show` empty state and `NotConnectedNotice` remain, KPI strip and new panels are gated behind `show` / `aConnected`.

## Notes

- Report order in `onRequestGet` MUST stay `[trend, kpi, pages, sources, device, city, day]` to match `shapeAnalytics`. Task 2 tests lock this.
- `engagementRate` from GA4 is a 0..1 ratio; shaping multiplies by 100.
- GA4 `dayOfWeek` is numeric 0..6 (0 = Sunday); we map to names ourselves rather than relying on `dayOfWeekName`.
- Visitor-to-lead rate is intentionally hidden (not zeroed) when the lead pipeline or analytics is not connected, to avoid a misleading rate.
