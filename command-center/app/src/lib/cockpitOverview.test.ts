import { describe, expect, it } from "vitest";
import { activeStaffCount, enabledSurfacesSummary, formatAccountAge } from "./cockpitOverview";

describe("activeStaffCount", () => {
  it("counts only active staff", () => {
    expect(
      activeStaffCount([
        { status: "active" },
        { status: "disabled" },
        { status: "active" },
      ]),
    ).toBe(2);
  });

  it("returns 0 for an empty roster", () => {
    expect(activeStaffCount([])).toBe(0);
  });
});

describe("formatAccountAge", () => {
  const now = new Date("2026-07-03T00:00:00Z").getTime();

  it("reads a same-day account as new today", () => {
    expect(formatAccountAge("2026-07-03T00:00:00Z", now)).toBe("New today");
    expect(formatAccountAge("2026-07-02T23:00:00Z", now)).toBe("New today");
  });

  it("counts single vs plural days under a month", () => {
    expect(formatAccountAge(new Date(now - 1 * 86_400_000).toISOString(), now)).toBe("1 day");
    expect(formatAccountAge(new Date(now - 12 * 86_400_000).toISOString(), now)).toBe("12 days");
    expect(formatAccountAge(new Date(now - 29 * 86_400_000).toISOString(), now)).toBe("29 days");
  });

  it("switches to months at the 30-day boundary", () => {
    expect(formatAccountAge(new Date(now - 30 * 86_400_000).toISOString(), now)).toBe("1 month");
    expect(formatAccountAge(new Date(now - 90 * 86_400_000).toISOString(), now)).toBe("3 months");
    expect(formatAccountAge(new Date(now - 330 * 86_400_000).toISOString(), now)).toBe("11 months");
  });

  it("switches to years at the 12-month boundary and keeps a remainder", () => {
    expect(formatAccountAge(new Date(now - 360 * 86_400_000).toISOString(), now)).toBe("1 year");
    expect(formatAccountAge(new Date(now - 420 * 86_400_000).toISOString(), now)).toBe(
      "1 year 2 months",
    );
    expect(formatAccountAge(new Date(now - 750 * 86_400_000).toISOString(), now)).toBe(
      "2 years 1 month",
    );
  });

  it("returns a placeholder for an unparseable date", () => {
    expect(formatAccountAge("not-a-date", now)).toBe("-");
  });
});

describe("enabledSurfacesSummary", () => {
  it("reports zero of the total when nothing is enabled", () => {
    const summary = enabledSurfacesSummary([]);
    expect(summary.count).toBe(0);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.labels).toEqual([]);
  });

  it("labels only the enabled capabilities, in registry order", () => {
    const summary = enabledSurfacesSummary(["billing", "overview"]);
    expect(summary.count).toBe(2);
    expect(summary.labels).toEqual(["Overview", "Billing"]);
  });

  it("ignores unknown entitlement keys", () => {
    const summary = enabledSurfacesSummary(["overview", "not_a_real_capability"]);
    expect(summary.count).toBe(1);
    expect(summary.labels).toEqual(["Overview"]);
  });
});
