import { describe, it, expect } from "vitest";
import type { Capability } from "./capabilities";
import {
  TOUR_STEPS,
  CURRENT_TOUR_VERSION,
  visibleSteps,
} from "./tourSteps";

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

describe("visibleSteps", () => {
  it("returns the full tour for a first-time owner", () => {
    const steps = visibleSteps({ isOwner: true, can: ownerCan, sinceVersion: null });
    expect(steps).toEqual(TOUR_STEPS);
  });

  it("hides surfaces a staff member cannot view", () => {
    const steps = visibleSteps({
      isOwner: false,
      can: staffCan(["pipeline", "inbox"]),
      sinceVersion: null,
    });
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("pipeline");
    expect(ids).toContain("inbox");
    // Gated surfaces the staffer lacks are absent.
    expect(ids).not.toContain("paid-ads");
    expect(ids).not.toContain("billing");
    // Ungated cards (welcome, chat, finish) always survive.
    expect(ids).toContain("welcome");
    expect(ids).toContain("chat");
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
    const steps = visibleSteps({ isOwner: true, can: ownerCan, sinceVersion: 0 });
    // sinceVersion 0 with all-v1 content behaves like a full tour.
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
