import { describe, it, expect } from "vitest";
import type { Capability } from "./capabilities";
import {
  TOUR_STEPS,
  CURRENT_TOUR_VERSION,
  visibleSteps,
} from "./tourSteps";
import { NAV, flattenNav } from "./nav";

// An owner sees everything.
const ownerCan = () => true;
// A staff member with a fixed grant set.
const staffCan =
  (allowed: Capability[]) =>
  (capability: Capability) =>
    allowed.includes(capability);

describe("tour registry integrity", () => {
  it("has unique step ids", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses positive versions and exposes the max as the current version", () => {
    expect(TOUR_STEPS.every((s) => Number.isInteger(s.version) && s.version >= 1)).toBe(true);
    const max = Math.max(...TOUR_STEPS.map((s) => s.version));
    expect(CURRENT_TOUR_VERSION).toBe(max);
  });
});

describe("tour covers the app", () => {
  // The rule: a page in the sidebar is a page in the tour. Adding a nav row
  // without a step fails here, so new features cannot skip the walkthrough.
  it("has a step for every sidebar page, plus Team and Settings", () => {
    const routes = new Set(TOUR_STEPS.map((s) => s.route));
    const pages = flattenNav(NAV)
      .filter((item) => !item.sidebarHidden)
      .map((item) => item.to)
      .concat("/team", "/settings");
    const missing = pages.filter((to) => !routes.has(to));
    expect(missing).toEqual([]);
  });

  it("gates each page step exactly as the nav gates its row", () => {
    for (const item of flattenNav(NAV)) {
      const step = TOUR_STEPS.find((s) => s.route === item.to && s.target.desktop);
      if (!step) continue;
      expect([item.to, step.capability]).toEqual([item.to, item.capability]);
      expect([item.to, step.dataGate]).toEqual([item.to, item.dataGate]);
    }
  });

  it("only points at routes the app still has", () => {
    const known = new Set(flattenNav(NAV).map((i) => i.to).concat("/settings"));
    for (const step of TOUR_STEPS) expect(known.has(step.route)).toBe(true);
  });
});

describe("visibleSteps", () => {
  it("returns the full tour for a first-time owner", () => {
    const steps = visibleSteps({ isOwner: true, can: ownerCan, hasData: () => true, sinceVersion: null });
    expect(steps).toEqual(TOUR_STEPS);
  });

  it("skips Organic where the client has no Organic page", () => {
    const ids = visibleSteps({ isOwner: true, can: ownerCan, sinceVersion: null }).map((s) => s.id);
    expect(ids).not.toContain("organic");
  });

  it("hides surfaces a staff member cannot view", () => {
    const steps = visibleSteps({
      isOwner: false,
      can: staffCan(["pipeline", "inbox"]),
      sinceVersion: null,
    });
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("sales-leads");
    expect(ids).toContain("inbox");
    // Gated surfaces the staffer lacks are absent, and so is owner-only Team.
    expect(ids).not.toContain("paid-ads");
    expect(ids).not.toContain("home");
    expect(ids).not.toContain("team");
    // Ungated cards (welcome, settings, finish) always survive.
    expect(ids).toContain("welcome");
    expect(ids).toContain("settings");
    expect(ids).toContain("finish");
  });

  it("returns nothing new once caught up to the current version", () => {
    const steps = visibleSteps({
      isOwner: true,
      can: ownerCan,
      sinceVersion: CURRENT_TOUR_VERSION,
    });
    expect(steps).toEqual([]);
  });

  it("returns only newer steps for a returning client", () => {
    const steps = visibleSteps({ isOwner: true, can: ownerCan, hasData: () => true, sinceVersion: 0 });
    // sinceVersion 0 behaves like a full tour.
    expect(steps).toEqual(TOUR_STEPS);
    // A client already at the current version below the max would see only
    // steps strictly newer than their stored version.
    const newer = visibleSteps({
      isOwner: true,
      can: ownerCan,
      sinceVersion: CURRENT_TOUR_VERSION - 1,
    });
    expect(newer.every((s) => s.version > CURRENT_TOUR_VERSION - 1)).toBe(true);
  });
});
