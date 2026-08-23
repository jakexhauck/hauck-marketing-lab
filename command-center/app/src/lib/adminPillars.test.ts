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
      "leads",
      "pipeline",
      "sales-data",
      "tasks",
      "inbox",
      "clients",
    ]);
  });

  it("carries the tabs the foundation plan specifies", () => {
    // The prospect book still lives inside Cold Call (lib/coldCallPages). Leads
    // is not a second one: it is the scraper's output, and a row leaves it by
    // being sent to one of the two tabs before it. It sits last on purpose, so
    // the pillar still lands on Cold Call.
    expect(tabsFor("acquisition").map((t) => t.id)).toEqual(["cold-call", "sms", "leads"]);
    // Two pages since 2026-08-23: Pipeline (the board outcomes land on) then
    // Data (the month read back). Sales Calls and Playbook are out of the
    // chrome; the labels are short because each is a rail row on its own.
    expect(tabsFor("sales").map((t) => t.id)).toEqual(["pipeline", "sales-data"]);
    // Operations is no longer a rail group: Tasks, Inbox and Clients are
    // top-level rows and this pillar is only the route that hosts them. Business
    // Health, Calculator, Time Audit and SOPs came out of the nav with it.
    // The order is the rail's order, so the two cannot disagree.
    expect(tabsFor("operations").map((t) => t.id)).toEqual([
      "tasks",
      "inbox",
      "clients",
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
    expect(resolvePillarTab("sales", "leads")).toBe("pipeline");
    // A link written before Sales Calls existed still lands on Sales Data.
    expect(resolvePillarTab("sales", "sales-data")).toBe("sales-data");
    // Sales Calls, On Call and Playbook are all out of the pillar now. Their
    // old links land on Pipeline (the first tab) rather than a blank page.
    expect(resolvePillarTab("sales", "calls")).toBe("pipeline");
    expect(resolvePillarTab("sales", "on-call")).toBe("pipeline");
    expect(resolvePillarTab("sales", "playbook")).toBe("pipeline");
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
