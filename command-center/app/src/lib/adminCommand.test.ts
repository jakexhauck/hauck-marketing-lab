import { describe, expect, it } from "vitest";
import type { ConstraintStep, PillarConstraint } from "./api";
import {
  findConstraintForPillar,
  findSystemConstraint,
  pillarRoute,
  severityWord,
  sortBySeverity,
  sortSteps,
  stepStatusWord,
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
