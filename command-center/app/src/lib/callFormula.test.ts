import { describe, expect, it } from "vitest";
import {
  compileFormula,
  evaluateFormula,
  formatValue,
  isAnswerKey,
  parseAnswerNumber,
} from "../../functions/lib/callFormula";

// The sum a sales call says out loud. Everything here is about one of two
// failure modes: reading a number out of prose typed at speed, and refusing to
// show a number that is not true yet.

function run(src: string, values: Record<string, number | null>): number | null {
  const compiled = compileFormula(src);
  if (!compiled.ok) throw new Error(`did not compile: ${compiled.error}`);
  return evaluateFormula(compiled.formula, values);
}

describe("parseAnswerNumber", () => {
  it("reads a number typed as money", () => {
    expect(parseAnswerNumber("$9,500")).toBe(9500);
    expect(parseAnswerNumber("9500")).toBe(9500);
    expect(parseAnswerNumber("$ 9 500")).toBe(9500);
  });

  it("reads a number out of prose", () => {
    expect(parseAnswerNumber("about 12 a month")).toBe(12);
    expect(parseAnswerNumber("30/mo")).toBe(30);
  });

  it("takes the first number of a range", () => {
    // Documented choice, not an accident: mid-call the low end of "12-15" is
    // better than a dash.
    expect(parseAnswerNumber("12-15")).toBe(12);
  });

  it("keeps decimals, for a margin", () => {
    expect(parseAnswerNumber("0.35")).toBe(0.35);
  });

  it("is null when there is no number, and never zero", () => {
    // The whole point. Zero is a real answer; "they would not say" is not.
    expect(parseAnswerNumber("")).toBeNull();
    expect(parseAnswerNumber("they wouldn't say")).toBeNull();
    expect(parseAnswerNumber("0")).toBe(0);
  });
});

describe("formatValue", () => {
  it("writes money the way you say it", () => {
    expect(formatValue(171000, "money")).toBe("$171,000");
    expect(formatValue(59850.5, "money")).toBe("$59,850.50");
  });

  it("hides a floating point tail rather than growing decimals for it", () => {
    // 171000 * 0.35. Without rounding first this reads $59,850.00.
    expect(formatValue(59849.99999999999, "money")).toBe("$59,850");
  });

  it("puts the minus outside the dollar sign", () => {
    expect(formatValue(-4000, "money")).toBe("-$4,000");
  });

  it("writes a plain number without the sign", () => {
    expect(formatValue(18, "number")).toBe("18");
    expect(formatValue(0.35, "number")).toBe("0.35");
  });
});

describe("compileFormula", () => {
  it("compiles the sum this was built for", () => {
    const result = compileFormula("(goal - installs) * avg_ticket");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formula.keys).toEqual(["goal", "installs", "avg_ticket"]);
  });

  it("lists each key once, in the order met", () => {
    const result = compileFormula("goal - installs + goal");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formula.keys).toEqual(["goal", "installs"]);
  });

  it("refuses an empty sum", () => {
    expect(compileFormula("").ok).toBe(false);
    expect(compileFormula("   ").ok).toBe(false);
    expect(compileFormula(null).ok).toBe(false);
  });

  it("refuses an unclosed bracket", () => {
    expect(compileFormula("(goal - installs").ok).toBe(false);
  });

  it("refuses two names with nothing between them", () => {
    expect(compileFormula("goal installs").ok).toBe(false);
  });

  it("refuses an operator with nothing after it", () => {
    expect(compileFormula("goal *").ok).toBe(false);
  });

  it("names uppercase specifically, because it is the common mistake", () => {
    const result = compileFormula("Goal - installs");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("lowercase");
  });

  it("refuses anything that is not arithmetic", () => {
    // The security boundary, stated as a test. None of these are expressible.
    for (const src of [
      "fetch(1)",
      "goal ** 2",
      "goal; drop table",
      "this.constructor",
      "goal > installs",
      "'abc'",
      "goal % 2",
    ]) {
      expect(compileFormula(src).ok, src).toBe(false);
    }
  });
});

describe("evaluateFormula", () => {
  it("works out the gap Jake reads on the timeline line", () => {
    expect(run("(goal - installs) * avg_ticket", { goal: 30, installs: 12, avg_ticket: 9500 })).toBe(
      171000,
    );
  });

  it("applies margin to get profit", () => {
    // Binary floating point makes this 59849.99999999999. The value is left
    // exact and formatValue does the rounding, so nothing compounds.
    expect(run("gap_revenue * margin", { gap_revenue: 171000, margin: 0.35 })).toBeCloseTo(59850, 6);
  });

  it("respects precedence and brackets", () => {
    expect(run("2 + 3 * 4", {})).toBe(14);
    expect(run("(2 + 3) * 4", {})).toBe(20);
  });

  it("handles unary minus", () => {
    expect(run("-goal + 5", { goal: 3 })).toBe(2);
  });

  it("is null when any input is still unanswered", () => {
    // The reason this file exists. One blank box must not become a confident
    // wrong number said out loud to a prospect.
    expect(run("(goal - installs) * avg_ticket", { goal: 30, installs: 12 })).toBeNull();
    expect(run("goal * margin", { goal: 30, margin: null })).toBeNull();
  });

  it("treats zero as an answer, not as missing", () => {
    expect(run("goal - installs", { goal: 0, installs: 0 })).toBe(0);
  });

  it("is null on a divide by zero rather than infinity", () => {
    expect(run("goal / margin", { goal: 30, margin: 0 })).toBeNull();
  });

  it("is null rather than infinity on an overflow", () => {
    expect(run("big * big", { big: 1e308 })).toBeNull();
  });
});

describe("isAnswerKey", () => {
  it("accepts the shape of a key", () => {
    expect(isAnswerKey("goal")).toBe(true);
    expect(isAnswerKey("avg_ticket")).toBe(true);
    expect(isAnswerKey("gap2")).toBe(true);
  });

  it("refuses anything that would not survive a formula", () => {
    expect(isAnswerKey("")).toBe(false);
    expect(isAnswerKey("Goal")).toBe(false);
    expect(isAnswerKey("2goal")).toBe(false);
    expect(isAnswerKey("avg ticket")).toBe(false);
    expect(isAnswerKey("avg-ticket")).toBe(false);
    expect(isAnswerKey("a".repeat(25))).toBe(false);
    expect(isAnswerKey(12)).toBe(false);
  });
});
