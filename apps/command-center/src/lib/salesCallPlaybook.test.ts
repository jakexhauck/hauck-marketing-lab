import { describe, expect, it } from "vitest";
import {
  callStateKey,
  elapsedLabel,
  emptyCallState,
  normalizeCallState,
  sectionProgress,
} from "./salesCallPlaybook";

// The prompts live in the database now (0074), so these tests supply their own
// ids rather than importing a list. That is the point: the scratchpad has to
// behave the same whatever Jake has on the playbook this week.
const KNOWN = ["a", "b", "c"];

describe("sectionProgress", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("counts nothing covered on a fresh call", () => {
    expect(sectionProgress(items, [])).toEqual({ covered: 0, total: 3 });
  });

  it("counts only the ticks belonging to that section", () => {
    expect(sectionProgress(items, ["a", "elsewhere"]).covered).toBe(1);
  });

  it("takes its denominator from the playbook, not from what was ticked", () => {
    expect(sectionProgress(items, ["a", "b", "c", "gone"])).toEqual({ covered: 3, total: 3 });
  });

  it("reports an empty section rather than dividing by nothing", () => {
    expect(sectionProgress([], ["a"])).toEqual({ covered: 0, total: 0 });
  });
});

describe("normalizeCallState", () => {
  it("falls back to an empty call for junk", () => {
    expect(normalizeCallState(null, 1000, KNOWN)).toEqual(emptyCallState(1000));
    expect(normalizeCallState("what", 1000, KNOWN)).toEqual(emptyCallState(1000));
    expect(normalizeCallState(42, 1000, KNOWN)).toEqual(emptyCallState(1000));
  });

  it("keeps a stored start time so a refresh does not restart the clock", () => {
    expect(normalizeCallState({ startedAt: 500 }, 1000, KNOWN).startedAt).toBe(500);
  });

  it("ignores a start time that is not a real number", () => {
    expect(normalizeCallState({ startedAt: "500" }, 1000, KNOWN).startedAt).toBe(1000);
    expect(normalizeCallState({ startedAt: NaN }, 1000, KNOWN).startedAt).toBe(1000);
  });

  it("drops ticks and notes for prompts that have since been retired", () => {
    const state = normalizeCallState(
      {
        startedAt: 1,
        ticked: ["a", "retired", 7],
        notes: { a: "said it", retired: "orphan" },
      },
      1000,
      KNOWN,
    );
    expect(state.ticked).toEqual(["a"]);
    expect(state.notes).toEqual({ a: "said it" });
  });

  it("drops everything when the playbook is empty", () => {
    const state = normalizeCallState({ ticked: ["a"], notes: { a: "x" } }, 1000, []);
    expect(state.ticked).toEqual([]);
    expect(state.notes).toEqual({});
  });

  it("drops an empty note rather than storing a blank", () => {
    expect(normalizeCallState({ notes: { a: "" } }, 1000, KNOWN).notes).toEqual({});
  });
});

describe("callStateKey", () => {
  it("keys per meeting so two calls never share a state", () => {
    expect(callStateKey("m1")).not.toBe(callStateKey("m2"));
    expect(callStateKey("m1")).toBe("hml_oncall_m1");
  });
});

describe("elapsedLabel", () => {
  it("reads mm:ss under an hour", () => {
    expect(elapsedLabel(0, 0)).toBe("0:00");
    expect(elapsedLabel(0, 9_000)).toBe("0:09");
    expect(elapsedLabel(0, 754_000)).toBe("12:34");
  });

  it("grows an hours field once the call passes one", () => {
    expect(elapsedLabel(0, 3_723_000)).toBe("1:02:03");
  });

  it("clamps at zero rather than counting backwards", () => {
    expect(elapsedLabel(5_000, 0)).toBe("0:00");
  });
});
