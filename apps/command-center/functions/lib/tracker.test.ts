import { describe, it, expect } from "vitest";
import {
  isIsoDay,
  monthWindow,
  buildTrackerUpdate,
  type TrackerFieldSpec,
} from "./tracker";

// The spec the Sales Data endpoint uses, minus nothing: exercising the real
// shape keeps these tests honest about what the endpoint actually accepts.
const SPEC: TrackerFieldSpec = {
  callsOnCalendar: { column: "calls_on_calendar", kind: "int" },
  callsTaken: { column: "calls_taken", kind: "int" },
  cashCollected: { column: "cash_collected", kind: "money" },
  notes: { column: "notes", kind: "text" },
};

describe("isIsoDay", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isIsoDay("2026-07-18")).toBe(true);
    expect(isIsoDay("2024-02-29")).toBe(true); // leap day
  });

  it("rejects a well-formed but non-existent date", () => {
    expect(isIsoDay("2026-02-31")).toBe(false);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("2026-00-10")).toBe(false);
    expect(isIsoDay("2023-02-29")).toBe(false); // 2023 is not a leap year
  });

  it("rejects anything that is not a plain ISO day", () => {
    expect(isIsoDay("2026-7-18")).toBe(false); // unpadded
    expect(isIsoDay("2026-07-18T00:00:00Z")).toBe(false);
    expect(isIsoDay("")).toBe(false);
    expect(isIsoDay("yesterday")).toBe(false);
    expect(isIsoDay(20260718)).toBe(false);
    expect(isIsoDay(null)).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
  });
});

describe("monthWindow", () => {
  it("spans the whole month, inclusive", () => {
    expect(monthWindow("2026-07")).toEqual({ first: "2026-07-01", last: "2026-07-31" });
    expect(monthWindow("2026-04")).toEqual({ first: "2026-04-01", last: "2026-04-30" });
  });

  it("handles February in both leap and non-leap years", () => {
    expect(monthWindow("2026-02")?.last).toBe("2026-02-28");
    expect(monthWindow("2024-02")?.last).toBe("2024-02-29");
  });

  it("returns null for a malformed or impossible month", () => {
    expect(monthWindow("2026-13")).toBeNull();
    expect(monthWindow("2026-00")).toBeNull();
    expect(monthWindow("2026-7")).toBeNull();
    expect(monthWindow("July 2026")).toBeNull();
    expect(monthWindow("")).toBeNull();
  });
});

describe("buildTrackerUpdate", () => {
  it("maps whitelisted camelCase fields onto their snake_case columns", () => {
    const result = buildTrackerUpdate(SPEC, {
      callsOnCalendar: 12,
      callsTaken: "9",
      notes: "  good day  ",
    });
    expect(result).toEqual({
      update: { calls_on_calendar: 12, calls_taken: 9, notes: "good day" },
    });
  });

  it("ignores fields that are not in the spec", () => {
    const result = buildTrackerUpdate(SPEC, {
      callsTaken: 4,
      calls_taken: 999, // snake_case is not the wire format
      dropTable: "x",
      id: "not-yours",
    });
    expect(result).toEqual({ update: { calls_taken: 4 } });
  });

  it("rejects a payload with no recognised field", () => {
    expect(buildTrackerUpdate(SPEC, { nope: 1 })).toEqual({
      error: "no valid fields",
    });
    expect(buildTrackerUpdate(SPEC, {})).toEqual({ error: "no valid fields" });
  });

  it("clears a numeric cell to null when it is emptied", () => {
    // Blanking a cell in the UI must erase the number, not store a 0: a day with
    // no calls logged is not a day with zero calls.
    expect(buildTrackerUpdate(SPEC, { callsTaken: "" })).toEqual({
      update: { calls_taken: null },
    });
    expect(buildTrackerUpdate(SPEC, { callsTaken: "   " })).toEqual({
      update: { calls_taken: null },
    });
    expect(buildTrackerUpdate(SPEC, { callsTaken: null })).toEqual({
      update: { calls_taken: null },
    });
  });

  it("clears a text cell to null when it is emptied", () => {
    expect(buildTrackerUpdate(SPEC, { notes: "   " })).toEqual({
      update: { notes: null },
    });
  });

  it("truncates a typed decimal on an integer column", () => {
    expect(buildTrackerUpdate(SPEC, { callsTaken: "9.7" })).toEqual({
      update: { calls_taken: 9 },
    });
  });

  it("keeps two decimals on a money column", () => {
    expect(buildTrackerUpdate(SPEC, { cashCollected: "4500.456" })).toEqual({
      update: { cash_collected: 4500.46 },
    });
    expect(buildTrackerUpdate(SPEC, { cashCollected: "1200" })).toEqual({
      update: { cash_collected: 1200 },
    });
  });

  it("strips currency formatting a human would actually type", () => {
    expect(buildTrackerUpdate(SPEC, { cashCollected: "$4,500.00" })).toEqual({
      update: { cash_collected: 4500 },
    });
  });

  it("rejects a negative number rather than storing it", () => {
    expect(buildTrackerUpdate(SPEC, { callsTaken: -3 })).toEqual({
      error: "callsTaken must be a non-negative number",
    });
    expect(buildTrackerUpdate(SPEC, { cashCollected: "-1" })).toEqual({
      error: "cashCollected must be a non-negative number",
    });
  });

  it("rejects a non-numeric value on a numeric column", () => {
    expect(buildTrackerUpdate(SPEC, { callsTaken: "lots" })).toEqual({
      error: "callsTaken must be a non-negative number",
    });
    expect(buildTrackerUpdate(SPEC, { callsTaken: Infinity })).toEqual({
      error: "callsTaken must be a non-negative number",
    });
  });

  it("rejects a non-string value on a text column", () => {
    expect(buildTrackerUpdate(SPEC, { notes: 42 })).toEqual({
      error: "notes must be text",
    });
  });

  it("caps free text so a paste cannot bloat the row", () => {
    const long = "x".repeat(3000);
    const result = buildTrackerUpdate(SPEC, { notes: long });
    expect("update" in result && (result.update.notes as string).length).toBe(2000);
  });
});
