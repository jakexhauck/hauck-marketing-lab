import { describe, it, expect } from "vitest";
import {
  ADMIN_PILLARS,
  getPillar,
  isPillarId,
  tabsFor,
  resolvePillarTab,
  placeholderCopy,
  type PillarId,
} from "./adminPillars";

describe("adminPillars config", () => {
  it("has the three tab-bearing pillars in value-chain order", () => {
    expect(ADMIN_PILLARS.map((p) => p.id)).toEqual([
      "acquisition",
      "sales",
      "operations",
    ]);
  });

  it("every pillar has at least one tab and unique tab ids", () => {
    for (const pillar of ADMIN_PILLARS) {
      expect(pillar.tabs.length).toBeGreaterThan(0);
      const ids = pillar.tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("marks exactly the tabs whose surface is built as ready", () => {
    // A tab flips to ready:true only when PillarPage has a real body for it, so
    // this list is the record of what has actually shipped. Add to it when a
    // surface lands, never to make a placeholder look finished.
    const ready = ADMIN_PILLARS.flatMap((p) =>
      p.tabs.filter((t) => t.ready).map((t) => t.id),
    );
    expect(ready).toEqual([
      "cold-call",
      "sms",
      "calls",
      "pipeline",
      "sales-data",
      "cold-call-data",
      "business-health",
      "calculator",
      "time-audit",
      "tasks",
      "sops",
    ]);
  });

  it("carries the tabs the foundation plan specifies", () => {
    // Leads moved inside Cold Call (lib/coldCallPages); the pillar's own tabs
    // are the two surfaces that sit beside each other.
    expect(tabsFor("acquisition").map((t) => t.id)).toEqual(["cold-call", "sms"]);
    // Sales Calls leads: it is the page with work on it. Sales Pipeline is the
    // board its outcomes land on, and Sales Data is the month read back.
    expect(tabsFor("sales").map((t) => t.id)).toEqual([
      "calls",
      "pipeline",
      "sales-data",
      "cold-call-data",
    ]);
    expect(tabsFor("operations").map((t) => t.id)).toEqual([
      "business-health",
      "calculator",
      "time-audit",
      "tasks",
      "sops",
    ]);
  });
});

describe("isPillarId / getPillar", () => {
  it("accepts the three pillar ids and rejects everything else", () => {
    expect(isPillarId("acquisition")).toBe(true);
    expect(isPillarId("sales")).toBe(true);
    expect(isPillarId("operations")).toBe(true);
    expect(isPillarId("delivery")).toBe(false);
    expect(isPillarId("nonsense")).toBe(false);
    expect(isPillarId(null)).toBe(false);
    expect(isPillarId(undefined)).toBe(false);
  });

  it("getPillar returns the def for a valid id, null otherwise", () => {
    expect(getPillar("sales")?.label).toBe("Sales");
    expect(getPillar("delivery")).toBeNull();
    expect(getPillar(null)).toBeNull();
  });
});

describe("resolvePillarTab", () => {
  it("returns the matching tab when the param is a known tab of the pillar", () => {
    expect(resolvePillarTab("acquisition", "cold-call")).toBe("cold-call");
    expect(resolvePillarTab("operations", "tasks")).toBe("tasks");
  });

  it("falls back to the first tab when the param is missing", () => {
    expect(resolvePillarTab("acquisition", null)).toBe("cold-call");
    expect(resolvePillarTab("acquisition", undefined)).toBe("cold-call");
    expect(resolvePillarTab("acquisition", "")).toBe("cold-call");
  });

  it("falls back to the first tab when the param is unknown or from another pillar", () => {
    expect(resolvePillarTab("acquisition", "bogus")).toBe("cold-call");
    // 'tasks' is an operations tab, not an acquisition tab -> default.
    expect(resolvePillarTab("acquisition", "tasks")).toBe("cold-call");
    expect(resolvePillarTab("sales", "leads")).toBe("calls");
    // A link written before Sales Calls existed still lands on Sales Data.
    expect(resolvePillarTab("sales", "sales-data")).toBe("sales-data");
  });

  it("defaults to the first declared tab for every pillar", () => {
    for (const pillar of ADMIN_PILLARS) {
      expect(resolvePillarTab(pillar.id as PillarId, null)).toBe(
        pillar.tabs[0].id,
      );
    }
  });
});

describe("placeholderCopy", () => {
  it("names the surface in the coming-soon copy", () => {
    expect(placeholderCopy("Cold Call")).toBe(
      "Cold Call is coming in a later phase.",
    );
  });
});
