import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  monthLabel,
  buildMonthDays,
  prevMonth,
  nextMonth,
  cursorForToday,
  toInt,
  pct,
  safeDivide,
  formatPct,
  formatNum,
  rollupColumn,
  countFilledDays,
} from "./trackerMonth";

describe("daysInMonth", () => {
  it("handles 31-, 30- and 28-day months", () => {
    expect(daysInMonth(2026, 6)).toBe(31); // July
    expect(daysInMonth(2026, 3)).toBe(30); // April
    expect(daysInMonth(2026, 1)).toBe(28); // Feb 2026 (non-leap)
  });

  it("handles a leap February", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
  });
});

describe("monthLabel", () => {
  it("names the month and year", () => {
    expect(monthLabel({ year: 2026, month: 6 })).toBe("July 2026");
    expect(monthLabel({ year: 2025, month: 0 })).toBe("January 2025");
  });
});

describe("buildMonthDays", () => {
  it("generates every day with a zero-padded ISO key", () => {
    const days = buildMonthDays({ year: 2026, month: 6 });
    expect(days).toHaveLength(31);
    expect(days[0].iso).toBe("2026-07-01");
    expect(days[30].iso).toBe("2026-07-31");
  });

  it("flags weekends", () => {
    // 2026-07-01 is a Wednesday; the 4th/5th are Sat/Sun.
    const days = buildMonthDays({ year: 2026, month: 6 });
    const sat = days.find((d) => d.day === 4)!;
    const sun = days.find((d) => d.day === 5)!;
    const wed = days.find((d) => d.day === 1)!;
    expect(sat.isWeekend).toBe(true);
    expect(sat.dowLabel).toBe("Sat");
    expect(sun.isWeekend).toBe(true);
    expect(wed.isWeekend).toBe(false);
    expect(wed.dowLabel).toBe("Wed");
  });

  it("flags exactly the injected today, and only in its own month", () => {
    const today = { year: 2026, month: 6, day: 17 };
    const july = buildMonthDays({ year: 2026, month: 6 }, today);
    expect(july.filter((d) => d.isToday).map((d) => d.day)).toEqual([17]);

    const august = buildMonthDays({ year: 2026, month: 7 }, today);
    expect(august.some((d) => d.isToday)).toBe(false);
  });

  it("never flags today when none is injected", () => {
    const days = buildMonthDays({ year: 2026, month: 6 }, null);
    expect(days.some((d) => d.isToday)).toBe(false);
  });
});

describe("month nav", () => {
  it("steps back, wrapping the year at January", () => {
    expect(prevMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 });
    expect(prevMonth({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 });
  });

  it("steps forward, wrapping the year at December", () => {
    expect(nextMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 7 });
    expect(nextMonth({ year: 2026, month: 11 })).toEqual({ year: 2027, month: 0 });
  });

  it("cursorForToday drops the day", () => {
    expect(cursorForToday({ year: 2026, month: 6, day: 17 })).toEqual({
      year: 2026,
      month: 6,
    });
  });
});

describe("toInt", () => {
  it("parses numeric strings and passes through numbers", () => {
    expect(toInt("131")).toBe(131);
    expect(toInt(21)).toBe(21);
  });

  it("treats blank and garbage as 0", () => {
    expect(toInt("")).toBe(0);
    expect(toInt("   ")).toBe(0);
    expect(toInt("abc")).toBe(0);
    expect(toInt(null)).toBe(0);
    expect(toInt(undefined)).toBe(0);
    expect(toInt(NaN)).toBe(0);
  });
});

describe("pct / safeDivide", () => {
  it("computes a percentage", () => {
    expect(pct(21, 131)).toBeCloseTo(16.0305, 3);
    expect(pct(1, 4)).toBe(25);
  });

  it("returns null on a zero or negative denominator (never divide-by-zero)", () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(5, -1)).toBeNull();
    expect(safeDivide(5, 0)).toBeNull();
    expect(safeDivide(10, 4)).toBe(2.5);
  });
});

describe("formatPct / formatNum", () => {
  it("renders a plain hyphen (not an em dash) for null", () => {
    expect(formatPct(null)).toBe("-");
    expect(formatNum(null)).toBe("-");
    // guard against an em dash sneaking back in
    expect(formatPct(null)).not.toContain("—");
    expect(formatNum(null)).not.toContain("—");
  });

  it("formats to the requested precision", () => {
    expect(formatPct(16.0305)).toBe("16.0%");
    expect(formatPct(16.0305, 2)).toBe("16.03%");
    expect(formatNum(2.5, 1)).toBe("2.5");
    expect(formatNum(12)).toBe("12");
  });
});

describe("rollupColumn / countFilledDays", () => {
  it("totals a column and averages it over the filled-day count", () => {
    const roll = rollupColumn([131, 118, 142], 3);
    expect(roll.total).toBe(391);
    expect(roll.average).toBeCloseTo(130.33, 2);
  });

  it("returns a null average when no days are filled (never divide-by-zero)", () => {
    const roll = rollupColumn([], 0);
    expect(roll.total).toBe(0);
    expect(roll.average).toBeNull();
  });

  it("counts only the rows a predicate marks as logged", () => {
    const rows = [
      { calls: "131" },
      { calls: "" },
      { calls: "96" },
      { calls: "   " },
    ];
    const filled = countFilledDays(rows, (r) => r.calls.trim() !== "");
    expect(filled).toBe(2);
  });
});
