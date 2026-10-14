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
