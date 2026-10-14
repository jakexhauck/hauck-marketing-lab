import { describe, it, expect } from "vitest";
import { MAX_JOB_VALUE_CENTS, parseJobValue } from "./manualStatusStore";

describe("parseJobValue", () => {
  it("takes what an owner actually types", () => {
    expect(parseJobValue("450")).toEqual({ cents: 45000 });
    expect(parseJobValue("450.50")).toEqual({ cents: 45050 });
    expect(parseJobValue("$1,250")).toEqual({ cents: 125000 });
    expect(parseJobValue(" 300 ")).toEqual({ cents: 30000 });
    expect(parseJobValue(249.99)).toEqual({ cents: 24999 });
  });

  // Empty means "I have not said", not "the job was worth nothing". Zero is a
  // real answer (a favour, a redo) and has to survive as one.
  it("separates an empty field from a zero", () => {
    expect(parseJobValue("")).toEqual({ cents: null });
    expect(parseJobValue(null)).toEqual({ cents: null });
    expect(parseJobValue(undefined)).toEqual({ cents: null });
    expect(parseJobValue("0")).toEqual({ cents: 0 });
    expect(parseJobValue(0)).toEqual({ cents: 0 });
  });

  it("refuses what cannot be money", () => {
    expect(parseJobValue("abc")).toEqual({ error: "not_a_number" });
    expect(parseJobValue("-50")).toEqual({ error: "negative" });
  });

  // Revenue and ROAS are computed straight off this number, so a fat finger
  // does not just look wrong on one row, it moves the whole dashboard.
  it("catches a fat finger before it reaches the dashboard", () => {
    expect(parseJobValue("1000000")).toEqual({ cents: MAX_JOB_VALUE_CENTS });
    expect(parseJobValue("1000001")).toEqual({ error: "too_large" });
  });

  // Rounding, not truncation: 0.005 of a dollar is half a cent and a floor
  // would quietly lose money on every third-of-a-dollar split.
  it("rounds to the nearest cent", () => {
    expect(parseJobValue("10.005")).toEqual({ cents: 1001 });
    expect(parseJobValue("10.004")).toEqual({ cents: 1000 });
  });
});
