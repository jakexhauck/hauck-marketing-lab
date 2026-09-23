import { describe, it, expect } from "vitest";
import {
  MAX_LABEL,
  SETUP_SECTIONS,
  SOFTWARE_LIVE_CODE,
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

function step(over: Partial<SetupStepRow> = {}): SetupStepRow {
  return {
    id: "s1",
    section: "ghl_setup",
    groupLabel: null,
    label: "A step",
    note: null,
    fieldLabel: null,
    position: 10,
    required: true,
    code: null,
    ...over,
  };
}

describe("the sections", () => {
  // The order is the order of the wizard and the order the work happens in.
  it("ships the four pillars, in order", () => {
    expect(SETUP_SECTIONS.map((s) => s.label)).toEqual([
      "Operations",
      "GHL",
      "GHL Follow Ups",
      "Facebook Ads",
    ]);
  });

  // The 0072 ids were retired by migration 0131. A stale reseed under one of
  // them must never show up in the new list.
  it("recognises its own sections and none of the retired ones", () => {
    for (const s of SETUP_SECTIONS) expect(isSetupSection(s.id)).toBe(true);
    for (const old of ["kickoff", "call", "ghl", "ads", "legacy_ghl"]) {
      expect(isSetupSection(old)).toBe(false);
    }
    expect(isSetupSection(null)).toBe(false);
  });
});

describe("the seed", () => {
  it("carries Jake's doc: 6, 8, 6 and 5 steps", () => {
    const rows = seedRows();
    const counts = SETUP_SECTIONS.map((s) => rows.filter((r) => r.section === s.id).length);
    expect(counts).toEqual([6, 8, 6, 5]);
  });

  it("gives the onboarding call its Fathom link box, and nothing else a box", () => {
    const boxed = seedRows().filter((r) => r.field_label);
    expect(boxed.map((r) => [r.label, r.field_label])).toEqual([
      ["Onboarding Call Done", "Fathom link"],
    ]);
  });

  it("keeps the follow ups' three subheadings, in order", () => {
    const fu = seedRows().filter((r) => r.section === "followups");
    expect([...new Set(fu.map((r) => r.group_label))]).toEqual([
      "Appointments",
      "Attribution",
      "Follow Ups",
    ]);
  });

  it("spaces positions within a pillar so a step can be dropped between two", () => {
    for (const s of SETUP_SECTIONS) {
      const rows = seedRows().filter((r) => r.section === s.id);
      const gaps = rows.slice(1).map((r, i) => r.position - rows[i].position);
      expect(gaps.every((g) => g >= 2)).toBe(true);
    }
  });

  it("wires only Software Account Made, which Software setup ticks", () => {
    const coded = seedRows().filter((r) => r.code);
    expect(coded.map((r) => [r.label, r.code])).toEqual([
      ["Software Account Made", SOFTWARE_LIVE_CODE],
    ]);
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
    expect(validateStepPatch({ section: "facebook" }).patch.section).toBe("facebook");
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
      step({ id: "c", position: 5, section: "facebook", label: "Other section" }),
    ];
    const groups = groupSteps(steps, "ghl_setup");
    expect(groups).toHaveLength(1);
    expect(groups[0].steps.map((s) => s.label)).toEqual(["First", "Second"]);
  });

  it("breaks a group when the subheading changes", () => {
    const steps = [
      step({ id: "a", position: 10, section: "facebook", groupLabel: "Day 1" }),
      step({ id: "b", position: 20, section: "facebook", groupLabel: "Day 1" }),
      step({ id: "c", position: 30, section: "facebook", groupLabel: "Day 2" }),
    ];
    const groups = groupSteps(steps, "facebook");
    expect(groups.map((g) => g.label)).toEqual(["Day 1", "Day 2"]);
    expect(groups[0].steps).toHaveLength(2);
  });

  // The same heading twice, far apart, is two groups: the order is what Jake
  // arranged, so it wins over the name.
  it("does not merge a repeated heading that is not adjacent", () => {
    const steps = [
      step({ id: "a", position: 10, section: "facebook", groupLabel: "Day 1" }),
      step({ id: "b", position: 20, section: "facebook", groupLabel: "Day 2" }),
      step({ id: "c", position: 30, section: "facebook", groupLabel: "Day 1" }),
    ];
    expect(groupSteps(steps, "facebook").map((g) => g.label)).toEqual(["Day 1", "Day 2", "Day 1"]);
  });
});

describe("progress and blocking", () => {
  const steps = [
    step({ id: "a", required: true }),
    step({ id: "b", required: false }),
    step({ id: "c", section: "facebook", required: true }),
  ];

  it("counts within one section", () => {
    expect(sectionProgress(steps, "ghl_setup", new Set(["a"]))).toEqual({ done: 1, total: 2, pct: 50 });
    expect(sectionProgress(steps, "facebook", new Set())).toEqual({ done: 0, total: 1, pct: 0 });
  });

  it("is not tripped up by an empty section", () => {
    expect(sectionProgress([], "ghl_setup", new Set())).toEqual({ done: 0, total: 0, pct: 0 });
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
    expect(nextPosition(steps, "ghl_setup")).toBe(50);
  });

  it("starts somewhere sensible in an empty section", () => {
    expect(nextPosition([], "facebook")).toBe(10);
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
