import { describe, it, expect } from "vitest";
import {
  BUNDLES,
  DIALERS,
  clientProgress,
  isBundle,
  isDialer,
  pillarProgress,
} from "./onboardingWizard";
import type { SetupStepRow } from "./setupSteps";

function step(id: string, section: SetupStepRow["section"]): SetupStepRow {
  return {
    id,
    section,
    groupLabel: null,
    label: id,
    note: null,
    fieldLabel: null,
    position: 10,
    required: true,
    code: null,
  };
}

const steps = [
  step("a", "operations"),
  step("b", "operations"),
  step("c", "ghl_setup"),
  step("d", "facebook"),
];

describe("options", () => {
  it("offers the two bundles and the two dialers", () => {
    expect(BUNDLES.map((b) => b.label)).toEqual(["Ads only", "Ads + Website"]);
    expect(DIALERS.map((d) => d.label)).toEqual(["We dial", "Client dials"]);
  });

  it("recognises only its own values", () => {
    expect(isBundle("ads")).toBe(true);
    expect(isBundle("ads_website")).toBe(true);
    expect(isBundle("website")).toBe(false);
    expect(isDialer("agency")).toBe(true);
    expect(isDialer("client")).toBe(true);
    expect(isDialer(null)).toBe(false);
  });
});

describe("pillarProgress", () => {
  it("counts one pillar's ticks", () => {
    expect(pillarProgress(steps, "operations", new Set(["a"]))).toEqual({ done: 1, total: 2 });
  });

  // A tick on a step that has since been removed in Settings must not count.
  it("ignores ticks on steps that are not in the list", () => {
    expect(pillarProgress(steps, "operations", new Set(["a", "gone"]))).toEqual({
      done: 1,
      total: 2,
    });
  });
});

describe("clientProgress", () => {
  it("adds every pillar's ticks", () => {
    expect(clientProgress(steps, new Set())).toEqual({ done: 0, total: 4 });
    expect(clientProgress(steps, new Set(["a", "c", "gone"]))).toEqual({ done: 2, total: 4 });
  });
});
