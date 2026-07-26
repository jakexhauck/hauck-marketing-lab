import { describe, expect, it } from "vitest";
import {
  COLD_CALL_PAGES,
  coldCallPagesFor,
  coldCallSides,
  resolveColdCallView,
} from "./coldCallPages";
import { COLD_CALL_STAGES } from "./coldCallStages";

describe("coldCallPagesFor", () => {
  it("is the pipeline in order, then the tracker, then what an owner runs", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual([
      "new-lead",
      "first-dial",
      "second-dial",
      "call-back",
      "booked",
      "not-interested",
      "tracker",
      "assign",
      "settings",
    ]);
  });

  it("gives a caller every stage and his own tracker", () => {
    // All of it is his job: hiding a stage would hide part of the work, and
    // hiding the tracker would hide the numbers he is measured on.
    const ids = coldCallPagesFor(false).map((p) => p.id);
    for (const stage of COLD_CALL_STAGES) expect(ids).toContain(stage.id);
    expect(ids).toContain("tracker");
  });

  it("keeps assigning and the script owner-only", () => {
    const ids = coldCallPagesFor(false).map((p) => p.id);
    expect(ids).not.toContain("assign");
    expect(ids).not.toContain("settings");
    expect(COLD_CALL_PAGES.filter((p) => p.ownerOnly).map((p) => p.id)).toEqual([
      "assign",
      "settings",
    ]);
  });

  it("has no page left over from an earlier strip", () => {
    // Leads/Callbacks became stages; Brushed Off became a reason; Pipelines and
    // the Scoreboard are gone; Book is now Assign.
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    for (const gone of [
      "leads",
      "callbacks",
      "stages",
      "pipelines",
      "brushed-off",
      "scoreboard",
      "book",
    ]) {
      expect(ids).not.toContain(gone);
    }
  });
});

describe("coldCallSides", () => {
  it("splits the work from the running of it", () => {
    const { left, right } = coldCallSides(true);
    expect(left.map((p) => p.id)).toEqual([
      "new-lead",
      "first-dial",
      "second-dial",
      "call-back",
      "booked",
      "not-interested",
      "tracker",
    ]);
    expect(right.map((p) => p.id)).toEqual(["assign", "settings"]);
  });

  it("gives a caller no right-hand group at all, so he gets no divider", () => {
    const { left, right } = coldCallSides(false);
    expect(right).toEqual([]);
    expect(left.length).toBeGreaterThan(0);
  });

  it("loses no page in the split", () => {
    const { left, right } = coldCallSides(true);
    expect(left.length + right.length).toBe(coldCallPagesFor(true).length);
  });
});

describe("resolveColdCallView", () => {
  it("returns a known page", () => {
    expect(resolveColdCallView("call-back", false)).toBe("call-back");
    expect(resolveColdCallView("settings", true)).toBe("settings");
  });

  it("lands on the first stage when the param is missing or nonsense", () => {
    expect(resolveColdCallView(null, false)).toBe("new-lead");
    expect(resolveColdCallView(undefined, true)).toBe("new-lead");
    expect(resolveColdCallView("", true)).toBe("new-lead");
    expect(resolveColdCallView("bogus", true)).toBe("new-lead");
  });

  it("sends a bookmark from an earlier strip somewhere real", () => {
    // ?view=book and ?view=scoreboard were both real pages an hour ago.
    expect(resolveColdCallView("book", true)).toBe("new-lead");
    expect(resolveColdCallView("scoreboard", true)).toBe("new-lead");
  });

  it("sends a cold caller who types ?view=assign back to the first stage", () => {
    // Hiding the tab is not the enforcement (the API is), but a typed URL must
    // not render a page the role cannot use.
    expect(resolveColdCallView("assign", false)).toBe("new-lead");
    expect(resolveColdCallView("settings", false)).toBe("new-lead");
  });
});
