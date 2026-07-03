import { describe, expect, it } from "vitest";
import type { ConstraintStep, PillarConstraint } from "./api";
import {
  addConstraintStep,
  buildConstraintPayload,
  type ConstraintFormState,
  findConstraintForPillar,
  findSystemConstraint,
  pillarRoute,
  removeConstraintStep,
  reorderConstraintStep,
  resequenceSteps,
  severityWord,
  sortBySeverity,
  sortSteps,
  stepStatusWord,
  toFormState,
} from "./adminCommand";

function mk(overrides: Partial<PillarConstraint>): PillarConstraint {
  return {
    pillar: "acquisition",
    title: "t",
    severity: "low",
    metric: null,
    detail: null,
    impact: null,
    isSystem: false,
    throughputVal: null,
    throughputLabel: null,
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
    ...overrides,
  };
}

describe("pillarRoute", () => {
  it("routes delivery to its dedicated cockpit", () => {
    expect(pillarRoute("delivery")).toBe("/admin/delivery");
  });

  it("routes every other pillar to the generic pillar workspace", () => {
    expect(pillarRoute("acquisition")).toBe("/admin/pillar/acquisition");
    expect(pillarRoute("sales")).toBe("/admin/pillar/sales");
    expect(pillarRoute("operations")).toBe("/admin/pillar/operations");
  });
});

describe("severityWord", () => {
  it("maps severity to the constraint-board vocabulary", () => {
    expect(severityWord("high")).toBe("BINDING");
    expect(severityWord("med")).toBe("WATCH");
    expect(severityWord("low")).toBe("SLACK");
  });
});

describe("sortBySeverity", () => {
  it("ranks high before med before low regardless of input order", () => {
    const low = mk({ pillar: "operations", severity: "low" });
    const high = mk({ pillar: "delivery", severity: "high" });
    const med = mk({ pillar: "sales", severity: "med" });
    expect(sortBySeverity([low, med, high]).map((c) => c.pillar)).toEqual([
      "delivery",
      "sales",
      "operations",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [mk({ severity: "low" }), mk({ severity: "high" })];
    const before = [...input];
    sortBySeverity(input);
    expect(input).toEqual(before);
  });

  it("returns an empty array when given no rows", () => {
    expect(sortBySeverity([])).toEqual([]);
  });
});

describe("findSystemConstraint", () => {
  it("returns the one row flagged isSystem", () => {
    const sys = mk({ pillar: "delivery", isSystem: true });
    const rows = [mk({ pillar: "acquisition" }), sys, mk({ pillar: "sales" })];
    expect(findSystemConstraint(rows)).toBe(sys);
  });

  it("returns undefined when no row is the system constraint (empty or unset DB)", () => {
    expect(findSystemConstraint([mk({}), mk({})])).toBeUndefined();
    expect(findSystemConstraint([])).toBeUndefined();
  });
});

describe("findConstraintForPillar", () => {
  it("finds the row for a given pillar", () => {
    const target = mk({ pillar: "sales" });
    expect(
      findConstraintForPillar([mk({ pillar: "acquisition" }), target], "sales"),
    ).toBe(target);
  });

  it("returns undefined when the pillar has no row (empty DB)", () => {
    expect(findConstraintForPillar([], "sales")).toBeUndefined();
  });
});

function mkStep(overrides: Partial<ConstraintStep>): ConstraintStep {
  return {
    step: "Identify",
    action: "a",
    owner: null,
    status: "todo",
    sort: 0,
    ...overrides,
  };
}

describe("stepStatusWord", () => {
  it("maps every attack-plan step status to its tag label", () => {
    expect(stepStatusWord("todo")).toBe("To do");
    expect(stepStatusWord("doing")).toBe("In progress");
    expect(stepStatusWord("done")).toBe("Done");
  });
});

describe("sortSteps", () => {
  it("orders steps by their sort field regardless of input order", () => {
    const first = mkStep({ step: "Identify", sort: 0 });
    const second = mkStep({ step: "Exploit", sort: 1 });
    const third = mkStep({ step: "Subordinate", sort: 2 });
    expect(sortSteps([third, first, second]).map((s) => s.step)).toEqual([
      "Identify",
      "Exploit",
      "Subordinate",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [mkStep({ sort: 1 }), mkStep({ sort: 0 })];
    const before = [...input];
    sortSteps(input);
    expect(input).toEqual(before);
  });

  it("returns an empty array when given no steps", () => {
    expect(sortSteps([])).toEqual([]);
  });
});

describe("toFormState", () => {
  it("turns null optional fields into empty strings for text inputs", () => {
    const form = toFormState(mk({ metric: null, detail: null, impact: null, throughputVal: null, throughputLabel: null }));
    expect(form.metric).toBe("");
    expect(form.detail).toBe("");
    expect(form.impact).toBe("");
    expect(form.throughputVal).toBe("");
    expect(form.throughputLabel).toBe("");
  });

  it("carries non-null fields through unchanged", () => {
    const c = mk({ metric: "12 leads/wk", detail: "d", impact: "i", isSystem: true });
    const form = toFormState(c);
    expect(form.metric).toBe("12 leads/wk");
    expect(form.detail).toBe("d");
    expect(form.impact).toBe("i");
    expect(form.isSystem).toBe(true);
  });

  it("sorts steps into their visible order", () => {
    const c = mk({ steps: [mkStep({ step: "Exploit", sort: 1 }), mkStep({ step: "Identify", sort: 0 })] });
    expect(toFormState(c).steps.map((s) => s.step)).toEqual(["Identify", "Exploit"]);
  });
});

describe("resequenceSteps", () => {
  it("renumbers sort to match array order, ignoring the input sort values", () => {
    const steps = [mkStep({ step: "a", sort: 9 }), mkStep({ step: "b", sort: 4 }), mkStep({ step: "c", sort: 100 })];
    expect(resequenceSteps(steps).map((s) => s.sort)).toEqual([0, 1, 2]);
  });

  it("does not mutate the input array", () => {
    const steps = [mkStep({ sort: 5 })];
    const before = [...steps];
    resequenceSteps(steps);
    expect(steps).toEqual(before);
  });
});

describe("reorderConstraintStep", () => {
  it("moves a step up, swapping with its predecessor", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" }), mkStep({ step: "c" })];
    const result = reorderConstraintStep(steps, 1, "up");
    expect(result.map((s) => s.step)).toEqual(["b", "a", "c"]);
    expect(result.map((s) => s.sort)).toEqual([0, 1, 2]);
  });

  it("moves a step down, swapping with its successor", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" }), mkStep({ step: "c" })];
    const result = reorderConstraintStep(steps, 1, "down");
    expect(result.map((s) => s.step)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op moving the first step up", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" })];
    expect(reorderConstraintStep(steps, 0, "up").map((s) => s.step)).toEqual(["a", "b"]);
  });

  it("is a no-op moving the last step down", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" })];
    expect(reorderConstraintStep(steps, 1, "down").map((s) => s.step)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" })];
    const before = [...steps];
    reorderConstraintStep(steps, 0, "down");
    expect(steps).toEqual(before);
  });
});

describe("addConstraintStep", () => {
  it("appends a blank Identify/todo step at the end with the next sort", () => {
    const steps = [mkStep({ step: "Exploit", sort: 0 })];
    const result = addConstraintStep(steps);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ step: "Identify", action: "", owner: null, status: "todo", sort: 1 });
  });

  it("works from an empty list", () => {
    expect(addConstraintStep([])).toHaveLength(1);
  });
});

describe("removeConstraintStep", () => {
  it("removes the step at the given index and resequences the rest", () => {
    const steps = [mkStep({ step: "a" }), mkStep({ step: "b" }), mkStep({ step: "c" })];
    const result = removeConstraintStep(steps, 1);
    expect(result.map((s) => s.step)).toEqual(["a", "c"]);
    expect(result.map((s) => s.sort)).toEqual([0, 1]);
  });

  it("returns an empty array when removing the only step", () => {
    expect(removeConstraintStep([mkStep({})], 0)).toEqual([]);
  });
});

function mkFormState(overrides: Partial<ConstraintFormState>): ConstraintFormState {
  return {
    pillar: "acquisition",
    title: "t",
    severity: "low",
    metric: "",
    detail: "",
    impact: "",
    isSystem: false,
    throughputVal: "",
    throughputLabel: "",
    steps: [],
    ...overrides,
  };
}

describe("buildConstraintPayload", () => {
  it("trims the title and turns blank optional fields into null", () => {
    const payload = buildConstraintPayload(
      mkFormState({ title: "  Not enough leads  ", metric: "  ", detail: "", impact: "   " }),
    );
    expect(payload.title).toBe("Not enough leads");
    expect(payload.metric).toBeNull();
    expect(payload.detail).toBeNull();
    expect(payload.impact).toBeNull();
  });

  it("carries non-blank optional fields through trimmed", () => {
    const payload = buildConstraintPayload(
      mkFormState({ metric: " 12/wk ", throughputVal: " 40 ", throughputLabel: " Leads/week " }),
    );
    expect(payload.metric).toBe("12/wk");
    expect(payload.throughputVal).toBe("40");
    expect(payload.throughputLabel).toBe("Leads/week");
  });

  it("carries pillar, severity, and isSystem through unchanged", () => {
    const payload = buildConstraintPayload(mkFormState({ pillar: "delivery", severity: "high", isSystem: true }));
    expect(payload.pillar).toBe("delivery");
    expect(payload.severity).toBe("high");
    expect(payload.isSystem).toBe(true);
  });

  it("resequences step sort to match array order even if it drifted during editing", () => {
    const payload = buildConstraintPayload(
      mkFormState({
        steps: [
          mkStep({ step: "Exploit", sort: 7 }),
          mkStep({ step: "Identify", sort: 3 }),
        ],
      }),
    );
    expect(payload.steps.map((s) => s.step)).toEqual(["Exploit", "Identify"]);
    expect(payload.steps.map((s) => s.sort)).toEqual([0, 1]);
  });

  it("trims step action and turns a blank owner into null", () => {
    const payload = buildConstraintPayload(
      mkFormState({ steps: [mkStep({ action: "  Call the top 10  ", owner: "  " })] }),
    );
    expect(payload.steps[0].action).toBe("Call the top 10");
    expect(payload.steps[0].owner).toBeNull();
  });

  it("trims a non-blank step owner", () => {
    const payload = buildConstraintPayload(mkFormState({ steps: [mkStep({ owner: "  Jake  " })] }));
    expect(payload.steps[0].owner).toBe("Jake");
  });

  it("does not include updatedAt on the payload", () => {
    const payload = buildConstraintPayload(mkFormState({}));
    expect(payload).not.toHaveProperty("updatedAt");
  });
});
