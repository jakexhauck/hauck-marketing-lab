import { describe, it, expect } from "vitest";
import {
  SERVICE_TABS,
  DEFAULT_SERVICE_TAB,
  resolveServiceTab,
  resolveSubTab,
  subTabsFor,
} from "./deliveryCockpit";

describe("fulfillment cockpit tab model", () => {
  it("has the eight service tabs in order", () => {
    expect(SERVICE_TABS.map((t) => t.id)).toEqual([
      "overview",
      "software",
      "paid-ads",
      "web-design",
      "google-reviews",
      "reactivation",
      "billing",
      "config",
    ]);
  });

  it("overview, software, billing and config are ready and carry no sub-tabs", () => {
    for (const id of ["overview", "software", "billing", "config"] as const) {
      const t = SERVICE_TABS.find((x) => x.id === id)!;
      expect(t.ready).toBe(true);
      expect(t.subTabs).toBeUndefined();
    }
  });

  it("each service tab carries its sub-tabs", () => {
    expect(subTabsFor("paid-ads").map((s) => s.id)).toEqual([
      "campaigns",
      "ad-library",
      "ad-tracking",
      "data-leads",
    ]);
    expect(subTabsFor("web-design").map((s) => s.id)).toEqual([
      "site",
      "pages",
      "change-requests",
      "analytics",
    ]);
    expect(subTabsFor("google-reviews").map((s) => s.id)).toEqual([
      "funnel",
      "all-reviews",
      "requests",
      "reputation-report",
    ]);
    expect(subTabsFor("reactivation").map((s) => s.id)).toEqual([
      "campaign",
      "results",
    ]);
    expect(subTabsFor("overview")).toEqual([]);
    expect(subTabsFor("billing")).toEqual([]);
  });

  it("resolveServiceTab falls back to the default on junk", () => {
    expect(resolveServiceTab("paid-ads")).toBe("paid-ads");
    expect(resolveServiceTab("nope")).toBe(DEFAULT_SERVICE_TAB);
    expect(resolveServiceTab(null)).toBe(DEFAULT_SERVICE_TAB);
    expect(DEFAULT_SERVICE_TAB).toBe("overview");
  });

  it("resolveSubTab returns the first sub-tab on junk, null when none", () => {
    expect(resolveSubTab("paid-ads", "ad-tracking")).toBe("ad-tracking");
    // The retired Funnel sub-tab falls back rather than rendering nothing.
    expect(resolveSubTab("paid-ads", "funnel")).toBe("campaigns");
    expect(resolveSubTab("paid-ads", "nope")).toBe("campaigns");
    expect(resolveSubTab("paid-ads", null)).toBe("campaigns");
    expect(resolveSubTab("overview", "anything")).toBeNull();
  });
});
