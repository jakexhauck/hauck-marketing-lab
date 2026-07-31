import { describe, it, expect } from "vitest";
import {
  MAX_LABEL,
  READINESS_CODES,
  SETUP_SECTIONS,
  blockingSteps,
  groupSteps,
  isSetupSection,
  moveStep,
  nextPosition,
  outstandingRequired,
  sectionProgress,
  seedRows,
  validateStepPatch,
  type GateStep,
  type SetupStepRow,
} from "./setupSteps";
import { SETUP_STEPS } from "./clientSetup";

function step(over: Partial<SetupStepRow> = {}): SetupStepRow {
  return {
    id: "s1",
    section: "ghl",
    groupLabel: null,
    label: "A step",
    note: null,
    position: 10,
    required: true,
    code: null,
    ...over,
  };
}

describe("the sections", () => {
  // The order is the order the work happens in, and the page draws them in it.
  it("ships the four, in the order the work happens", () => {
    expect(SETUP_SECTIONS.map((s) => s.id)).toEqual(["kickoff", "call", "ghl", "ads"]);
  });

  it("recognises its own sections and nothing else", () => {
    expect(isSetupSection("kickoff")).toBe(true);
    expect(isSetupSection("call")).toBe(true);
    expect(isSetupSection("ghl")).toBe(true);
    expect(isSetupSection("ads")).toBe(true);
    expect(isSetupSection("wiring")).toBe(false);
    expect(isSetupSection(null)).toBe(false);
  });
});

describe("the seed", () => {
  it("carries every step from the code list", () => {
    expect(seedRows()).toHaveLength(SETUP_STEPS.length);
  });

  it("puts every step in a section this file knows", () => {
    const rows = seedRows();
    for (const section of SETUP_SECTIONS) {
      expect(rows.filter((r) => r.section === section.id).length).toBeGreaterThan(0);
    }
    expect(rows.every((r) => isSetupSection(r.section))).toBe(true);
  });

  it("carries Jake's three kickoff steps, and only those", () => {
    const kickoff = seedRows().filter((r) => r.section === "kickoff");
    expect(kickoff).toHaveLength(3);
    expect(kickoff.every((r) => r.required)).toBe(true);
    expect(kickoff.every((r) => r.group_label === null)).toBe(true);
  });

  // The call moves between four systems in one sitting, so it is the one
  // section whose steps name their own subheading.
  it("keeps the call's own subheadings", () => {
    const call = seedRows().filter((r) => r.section === "call");
    expect(call.every((r) => Boolean(r.group_label))).toBe(true);
    expect([...new Set(call.map((r) => r.group_label))]).toEqual([
      "Their account",
      "Ads manager",
      "HighLevel",
      "Subdomain",
    ]);
  });

  // What the client has to do on their own machine cannot hold up a launch.
  it("leaves the two client-side steps optional", () => {
    const optional = seedRows().filter((r) => !r.required && r.section === "call");
    expect(optional.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the days as subheadings on the ads side, and none on the GHL side", () => {
    const rows = seedRows();
    expect(rows.filter((r) => r.section === "ghl").every((r) => r.group_label === null)).toBe(true);
    expect(rows.filter((r) => r.section === "ads").every((r) => Boolean(r.group_label))).toBe(true);
  });

  it("spaces positions so a step can be dropped between two", () => {
    const rows = seedRows();
    const gaps = rows.slice(1).map((r, i) => r.position - rows[i].position);
    expect(gaps.every((g) => g >= 2)).toBe(true);
  });

  // The auto steps are matched on code, never on label, so renaming one in the
  // Management page keeps its wiring to the live GoHighLevel check.
  it("gives the three live-checked steps their codes, and nothing else", () => {
    const coded = seedRows().filter((r) => r.code);
    expect(coded.map((r) => r.code).sort()).toEqual(
      Object.values(READINESS_CODES).sort(),
    );
  });
});

describe("validateStepPatch", () => {
  it("takes a rename", () => {
    const { patch, error } = validateStepPatch({ label: "  Publish the workflows  " });
    expect(error).toBeNull();
    expect(patch.label).toBe("Publish the workflows");
  });

  it("refuses a step with no name", () => {
    expect(validateStepPatch({ label: "   " }).error).toBeTruthy();
  });

  it("caps a very long label rather than rejecting it", () => {
    const { patch } = validateStepPatch({ label: "x".repeat(500) });
    expect((patch.label as string).length).toBe(MAX_LABEL);
  });

  it("clears a note when it is emptied", () => {
    expect(validateStepPatch({ note: "" }).patch.note).toBeNull();
  });

  it("moves a step between sections", () => {
    expect(validateStepPatch({ section: "ads" }).patch.section).toBe("ads");
    expect(validateStepPatch({ section: "nope" }).error).toBeTruthy();
  });

  // The allow-list is the point: nothing else may reach the row.
  it("never writes code or archived, whatever is sent", () => {
    const { patch } = validateStepPatch({
      label: "Fine",
      code: "token-connected",
      archived: true,
      id: "another-step",
    });
    expect(patch.code).toBeUndefined();
    expect(patch.archived).toBeUndefined();
    expect(patch.id).toBeUndefined();
  });

  it("says so when there is nothing to change", () => {
    expect(validateStepPatch({}).error).toBe("nothing to change");
    expect(validateStepPatch(null).error).toBeTruthy();
  });
});

describe("groupSteps", () => {
  it("orders by position and keeps a section to itself", () => {
    const steps = [
      step({ id: "b", position: 20, label: "Second" }),
      step({ id: "a", position: 10, label: "First" }),
      step({ id: "c", position: 5, section: "ads", label: "Other section" }),
    ];
    const groups = groupSteps(steps, "ghl");
    expect(groups).toHaveLength(1);
    expect(groups[0].steps.map((s) => s.label)).toEqual(["First", "Second"]);
  });

  it("breaks a group when the subheading changes", () => {
    const steps = [
      step({ id: "a", position: 10, section: "ads", groupLabel: "Day 1" }),
      step({ id: "b", position: 20, section: "ads", groupLabel: "Day 1" }),
      step({ id: "c", position: 30, section: "ads", groupLabel: "Day 2" }),
    ];
    const groups = groupSteps(steps, "ads");
    expect(groups.map((g) => g.label)).toEqual(["Day 1", "Day 2"]);
    expect(groups[0].steps).toHaveLength(2);
  });

  // The same heading twice, far apart, is two groups: the order is what Jake
  // arranged, so it wins over the name.
  it("does not merge a repeated heading that is not adjacent", () => {
    const steps = [
      step({ id: "a", position: 10, section: "ads", groupLabel: "Day 1" }),
      step({ id: "b", position: 20, section: "ads", groupLabel: "Day 2" }),
      step({ id: "c", position: 30, section: "ads", groupLabel: "Day 1" }),
    ];
    expect(groupSteps(steps, "ads").map((g) => g.label)).toEqual(["Day 1", "Day 2", "Day 1"]);
  });
});

describe("progress and blocking", () => {
  const steps = [
    step({ id: "a", required: true }),
    step({ id: "b", required: false }),
    step({ id: "c", section: "ads", required: true }),
  ];

  it("counts within one section", () => {
    expect(sectionProgress(steps, "ghl", new Set(["a"]))).toEqual({ done: 1, total: 2, pct: 50 });
    expect(sectionProgress(steps, "ads", new Set())).toEqual({ done: 0, total: 1, pct: 0 });
  });

  it("is not tripped up by an empty section", () => {
    expect(sectionProgress([], "ghl", new Set())).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it("blocks only on required steps that are not done", () => {
    expect(blockingSteps(steps, new Set(["a"])).map((s) => s.id)).toEqual(["c"]);
    expect(blockingSteps(steps, new Set(["a", "c"]))).toEqual([]);
  });
});

// The Go Live gate, as the server counts it. This is the one the client cannot
// argue with, so it is tested on its own rather than through the page.
describe("outstandingRequired", () => {
  const gate = (over: Partial<GateStep> = {}): GateStep => ({
    id: "g1",
    label: "A step",
    required: true,
    code: null,
    ...over,
  });

  it("holds a client back for a required step nobody ticked", () => {
    const steps = [gate({ id: "a" }), gate({ id: "b" })];
    expect(outstandingRequired(steps, new Set(["a"])).map((s) => s.id)).toEqual(["b"]);
  });

  it("lets them through once every required step is ticked", () => {
    const steps = [gate({ id: "a" }), gate({ id: "b", required: false })];
    expect(outstandingRequired(steps, new Set(["a"]))).toEqual([]);
  });

  // The auto steps are answered by a live GoHighLevel check the browser runs and
  // this request cannot. Counting them meant Go Live could never be pressed.
  it("does not hold them back for a step the live checks tick", () => {
    const steps = [gate({ id: "auto", code: "token-connected" })];
    expect(outstandingRequired(steps, new Set())).toEqual([]);
  });

  // A tick is saved against the step's row id, which is what the gate reads.
  it("counts ticks by row id, not by anything else on the row", () => {
    const steps = [gate({ id: "row-uuid", label: "token-connected" })];
    expect(outstandingRequired(steps, new Set(["token-connected"]))).toHaveLength(1);
    expect(outstandingRequired(steps, new Set(["row-uuid"]))).toHaveLength(0);
  });
});

describe("nextPosition", () => {
  it("puts a new step after the last one in its section", () => {
    const steps = [step({ id: "a", position: 10 }), step({ id: "b", position: 40 })];
    expect(nextPosition(steps, "ghl")).toBe(50);
  });

  it("starts somewhere sensible in an empty section", () => {
    expect(nextPosition([], "ads")).toBe(10);
  });
});

describe("moveStep", () => {
  const list = (...positions: number[]): SetupStepRow[] =>
    positions.map((p, i) => step({ id: `s${i}`, position: p }));

  it("does nothing when the step has not moved", () => {
    expect(moveStep(list(10, 20, 30), 1, 1)).toEqual([]);
  });

  it("ignores an index that is not in the list", () => {
    expect(moveStep(list(10, 20), 5, 0)).toEqual([]);
    expect(moveStep(list(10, 20), 0, 9)).toEqual([]);
  });

  // The common case: one write, neighbours untouched.
  it("takes the midpoint between its new neighbours", () => {
    const writes = moveStep(list(10, 20, 30), 2, 1);
    expect(writes).toEqual([{ id: "s2", position: 15 }]);
  });

  it("goes past the last one when moved to the bottom", () => {
    expect(moveStep(list(10, 20, 30), 0, 2)).toEqual([{ id: "s0", position: 40 }]);
  });

  it("slots above the first one when moved to the top", () => {
    expect(moveStep(list(10, 20, 30), 2, 0)).toEqual([{ id: "s2", position: 5 }]);
  });

  // Enough moves and two neighbours end up adjacent. Rather than inventing a
  // fractional position the column cannot hold, the section is renumbered.
  it("renumbers the section when there is no room left between two", () => {
    const writes = moveStep(list(10, 11, 20), 2, 1);
    expect(writes).toEqual([
      { id: "s0", position: 10 },
      { id: "s2", position: 20 },
      { id: "s1", position: 30 },
    ]);
  });

  it("renumbers rather than colliding at the very top", () => {
    const writes = moveStep(list(1, 2, 3), 2, 0);
    expect(writes.length).toBe(3);
    expect(writes[0]).toEqual({ id: "s2", position: 10 });
  });

  it("produces an order that actually reads the way it was dropped", () => {
    const steps = list(10, 20, 30, 40);
    const writes = moveStep(steps, 3, 1);
    const applied = steps
      .map((s) => ({ ...s, position: writes.find((w) => w.id === s.id)?.position ?? s.position }))
      .sort((a, b) => a.position - b.position)
      .map((s) => s.id);
    expect(applied).toEqual(["s0", "s3", "s1", "s2"]);
  });
});
