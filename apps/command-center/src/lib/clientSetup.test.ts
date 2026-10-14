import { describe, it, expect } from "vitest";
import {
  QA_GROUPS,
  QA_ITEM_COUNT,
  QA_STEP_KEY,
  SETUP_PHASES,
  SETUP_STEPS,
  phaseProgress,
  setupPhases,
  setupProgress,
} from "./clientSetup";

describe("the step list", () => {
  it("gives every step a unique key", () => {
    const keys = SETUP_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every step in a declared phase", () => {
    const phases = new Set(SETUP_PHASES.map((p) => p.key));
    for (const step of SETUP_STEPS) expect(phases.has(step.phase)).toBe(true);
  });

  it("leaves no phase empty", () => {
    for (const phase of setupPhases()) expect(phase.steps.length).toBeGreaterThan(0);
  });

  it("keeps the phases in the order the work happens", () => {
    expect(SETUP_PHASES.map((p) => p.key)).toEqual([
      "kickoff",
      "call",
      "ghl",
      "day1",
      "day2",
      "day34",
      "day56",
      "day7",
    ]);
  });

  // Jake does not do this work, and a checklist listing jobs nobody intends to
  // do is a checklist people stop reading. The source SOP asks for GA4 access at
  // the Day 1 call; it is cut on purpose and must not creep back.
  it("asks for nothing about analytics, reviews or the client's website", () => {
    const text = SETUP_STEPS.map((s) => `${s.label} ${s.note ?? ""}`).join(" ").toLowerCase();
    expect(text).not.toContain("analytics");
    expect(text).not.toContain("ga4");
    expect(text).not.toContain("google business");
  });

  it("keeps the three live GHL checks as the only auto steps", () => {
    const auto = SETUP_STEPS.filter((s) => s.auto).map((s) => s.key).sort();
    expect(auto).toEqual(["calendars-present", "provision-values", "token-connected"]);
  });

  it("marks a real subset as required, not all of it and not none", () => {
    const required = SETUP_STEPS.filter((s) => s.required);
    expect(required.length).toBeGreaterThan(5);
    expect(required.length).toBeLessThan(SETUP_STEPS.length);
  });
});

describe("the QA checklist", () => {
  it("hangs off a step that exists", () => {
    expect(SETUP_STEPS.some((s) => s.key === QA_STEP_KEY)).toBe(true);
  });

  it("counts what it holds", () => {
    expect(QA_ITEM_COUNT).toBe(QA_GROUPS.reduce((n, g) => n + g.items.length, 0));
    expect(QA_ITEM_COUNT).toBeGreaterThan(20);
  });

  it("gives every group a unique key and something in it", () => {
    const keys = QA_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of QA_GROUPS) expect(g.items.length).toBeGreaterThan(0);
  });
});

describe("setupProgress", () => {
  it("counts nothing when nothing is saved", () => {
    const p = setupProgress([]);
    expect(p.done).toBe(0);
    expect(p.total).toBe(SETUP_STEPS.length);
    expect(p.pct).toBe(0);
  });

  it("counts only what is really done", () => {
    const p = setupProgress([
      { taskKey: "ghl-subaccount", done: true },
      { taskKey: "ghl-dedupe", done: false },
    ]);
    expect(p.done).toBe(1);
  });

  it("ignores a saved row for a step we no longer ship", () => {
    expect(setupProgress([{ taskKey: "retired-step", done: true }]).done).toBe(0);
  });

  it("reports 100% when every step is done", () => {
    const all = SETUP_STEPS.map((s) => ({ taskKey: s.key, done: true }));
    const p = setupProgress(all);
    expect(p.pct).toBe(100);
    expect(p.blocking).toEqual([]);
  });

  // The Go Live gate. Everything else is judgement; these are the steps that
  // make the client's app and ads work, so shipping without them ships broken.
  it("blocks on a required step and not on an optional one", () => {
    const allButOptional = SETUP_STEPS.filter((s) => s.required).map((s) => ({
      taskKey: s.key,
      done: true,
    }));
    expect(setupProgress(allButOptional).blocking).toEqual([]);

    const missingOne = allButOptional.slice(1);
    expect(setupProgress(missingOne).blocking.length).toBe(1);
  });
});

describe("phaseProgress", () => {
  it("counts within one phase only", () => {
    const ghl = setupPhases().find((p) => p.key === "ghl")!;
    const states = [
      { taskKey: ghl.steps[0].key, done: true },
      // A tick belonging to a later phase must not show up in this count.
      { taskKey: "d7-publish", done: true },
    ];
    const p = phaseProgress(ghl, states);
    expect(p.done).toBe(1);
    expect(p.total).toBe(ghl.steps.length);
  });
});
