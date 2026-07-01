import { describe, it, expect } from "vitest";
import { nextVisit, occurrences, type RecurrenceRule } from "./recurrence";

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  cadenceWeeks: 2,
  weekday: 2, // Tuesday
  anchorDate: "2026-07-07", // a Tuesday
  ...over,
});

describe("nextVisit", () => {
  it("returns the anchor when fromIso is the anchor", () => {
    expect(nextVisit(rule(), "2026-07-07")).toBe("2026-07-07");
  });
  it("weekly: next matching weekday on/after from", () => {
    expect(nextVisit(rule({ cadenceWeeks: 1 }), "2026-07-08")).toBe("2026-07-14");
  });
  it("biweekly: respects parity from the anchor (skips the off week)", () => {
    // 2026-07-14 is a Tuesday but one week off the anchor -> next is 07-21
    expect(nextVisit(rule(), "2026-07-09")).toBe("2026-07-21");
  });
  it("every 4 weeks lands on the 4-week multiple", () => {
    expect(nextVisit(rule({ cadenceWeeks: 4 }), "2026-07-08")).toBe("2026-08-04");
  });
  it("anchor in the future: returns the anchor if from is before it", () => {
    expect(nextVisit(rule({ anchorDate: "2026-08-04" }), "2026-07-01")).toBe("2026-08-04");
  });
  it("crosses a month boundary", () => {
    expect(nextVisit(rule({ cadenceWeeks: 1 }), "2026-07-29")).toBe("2026-08-04");
  });
});

describe("occurrences", () => {
  it("lists biweekly visits within a window, inclusive", () => {
    expect(occurrences(rule(), "2026-07-01", "2026-08-05")).toEqual([
      "2026-07-07",
      "2026-07-21",
      "2026-08-04",
    ]);
  });
  it("returns [] when the window has no matching date", () => {
    expect(occurrences(rule(), "2026-07-08", "2026-07-13")).toEqual([]);
  });
});
