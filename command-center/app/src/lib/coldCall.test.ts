import { describe, it, expect } from "vitest";
import {
  COLD_CALL_COLUMNS,
  coldCallFooter,
  computeColdCallRow,
  emptyColdCallRow,
  isColdCallNumericField,
  isFilledColdCallDay,
  monthParam,
  rollupColdCallMonth,
  summarizeColdCallMonth,
  toTrackerRows,
} from "./coldCall";
import type { TrackerRow } from "../components/admin/tracker/DailyTracker";

// A day row from the four counts, text cells blank unless given.
function day(
  callsMade: string,
  pickups: string,
  passThrough: string,
  meetingsBooked: string,
  extra: Partial<TrackerRow> = {},
): TrackerRow {
  return {
    ...emptyColdCallRow(),
    callsMade,
    pickups,
    passThrough,
    meetingsBooked,
    ...extra,
  };
}

describe("COLD_CALL_COLUMNS", () => {
  it("interleaves each input with the rate it feeds", () => {
    expect(COLD_CALL_COLUMNS.map((c) => c.key)).toEqual([
      "callsMade",
      "pickups",
      "pickupPct",
      "passThrough",
      "pickupToPtPct",
      "meetingsBooked",
      "pitchToBookPct",
      "objections",
      "notes",
    ]);
  });

  it("marks the three rate columns computed and never editable", () => {
    const computed = COLD_CALL_COLUMNS.filter((c) => c.kind === "computed");
    expect(computed.map((c) => c.key)).toEqual([
      "pickupPct",
      "pickupToPtPct",
      "pitchToBookPct",
    ]);
    expect(COLD_CALL_COLUMNS.filter((c) => c.kind === "text").map((c) => c.key)).toEqual([
      "objections",
      "notes",
    ]);
  });

  it("knows which fields are counts", () => {
    expect(isColdCallNumericField("callsMade")).toBe(true);
    expect(isColdCallNumericField("notes")).toBe(false);
    expect(isColdCallNumericField("pickupPct")).toBe(false);
  });
});

describe("monthParam", () => {
  it("zero-pads the 1-based month", () => {
    expect(monthParam({ year: 2026, month: 0 })).toBe("2026-01");
    expect(monthParam({ year: 2026, month: 6 })).toBe("2026-07");
    expect(monthParam({ year: 2026, month: 11 })).toBe("2026-12");
  });
});

describe("toTrackerRows", () => {
  it("keys rows by day and turns nulls into blank cells, never zeros", () => {
    const rows = toTrackerRows([
      {
        id: "a",
        day: "2026-07-01",
        callsMade: 120,
        pickups: 18,
        passThrough: null,
        meetingsBooked: 0,
        objections: null,
        notes: "gatekeepers",
      },
    ]);
    expect(rows["2026-07-01"]).toEqual({
      callsMade: "120",
      pickups: "18",
      passThrough: "",
      meetingsBooked: "0",
      objections: "",
      notes: "gatekeepers",
    });
  });

  it("returns an empty map for a month with no logged days", () => {
    expect(toTrackerRows([])).toEqual({});
  });
});

describe("computeColdCallRow", () => {
  it("computes pickup %, pickup to pass-through % and pitch to book %", () => {
    expect(computeColdCallRow(day("131", "21", "9", "2"))).toEqual({
      pickupPct: "16.0%", // 21 / 131
      pickupToPtPct: "42.9%", // 9 / 21
      pitchToBookPct: "22.2%", // 2 / 9
    });
  });

  it("renders a plain dash on a zero denominator, never NaN or Infinity", () => {
    // 0 dials and 0 pass-throughs are dead denominators. 4 pickups with nothing
    // passed through is a real 0%, not a missing value.
    const cells = computeColdCallRow(day("0", "4", "0", "1"));
    expect(cells).toEqual({
      pickupPct: "-",
      pickupToPtPct: "0.0%",
      pitchToBookPct: "-",
    });
    for (const value of Object.values(cells)) {
      expect(value).not.toContain("NaN");
      expect(value).not.toContain("Infinity");
    }
  });

  it("treats blank cells as no data, not as zeros", () => {
    expect(computeColdCallRow(emptyColdCallRow())).toEqual({
      pickupPct: "-",
      pickupToPtPct: "-",
      pitchToBookPct: "-",
    });
  });

  it("ignores garbage typed into a count", () => {
    // "abc" reads as no dials, so the pickup rate has no denominator.
    expect(computeColdCallRow(day("abc", "5", "", ""))).toEqual({
      pickupPct: "-",
      pickupToPtPct: "0.0%",
      pitchToBookPct: "-",
    });
  });

  it("reaches 100% when every dial connects", () => {
    expect(computeColdCallRow(day("10", "10", "10", "10"))).toEqual({
      pickupPct: "100.0%",
      pickupToPtPct: "100.0%",
      pitchToBookPct: "100.0%",
    });
  });
});

describe("isFilledColdCallDay", () => {
  it("counts a day with any count entered", () => {
    expect(isFilledColdCallDay(day("80", "", "", ""))).toBe(true);
    expect(isFilledColdCallDay(day("", "", "", "0"))).toBe(true);
  });

  it("does not count a blank day, or one with only text", () => {
    expect(isFilledColdCallDay(emptyColdCallRow())).toBe(false);
    expect(isFilledColdCallDay(day("", "", "", "", { notes: "sick day" }))).toBe(false);
    expect(isFilledColdCallDay(day("  ", "", "", ""))).toBe(false);
  });
});

describe("rollupColdCallMonth", () => {
  const rows = [
    day("100", "20", "10", "2"),
    day("", "", "", ""), // unlogged, must not drag the average down
    day("50", "10", "4", "0"),
  ];

  it("totals every count and averages over filled days only", () => {
    const { filledDays, columns } = rollupColdCallMonth(rows);
    expect(filledDays).toBe(2);
    expect(columns.callsMade.total).toBe(150);
    expect(columns.callsMade.average).toBe(75); // 150 / 2, not 150 / 3
    expect(columns.pickups.total).toBe(30);
    expect(columns.meetingsBooked.total).toBe(2);
    expect(columns.meetingsBooked.average).toBe(1);
  });

  it("returns a null average when no day is logged", () => {
    const { filledDays, columns } = rollupColdCallMonth([emptyColdCallRow()]);
    expect(filledDays).toBe(0);
    expect(columns.callsMade.total).toBe(0);
    expect(columns.callsMade.average).toBeNull();
  });
});

describe("coldCallFooter", () => {
  const rows = [day("100", "20", "10", "2"), day("50", "10", "4", "0"), emptyColdCallRow()];

  it("totals month to date and averages per logged day", () => {
    const { average, total } = coldCallFooter(rows);
    expect(total.callsMade).toBe("150");
    expect(total.pickups).toBe("30");
    expect(total.passThrough).toBe("14");
    expect(total.meetingsBooked).toBe("2");
    expect(average.callsMade).toBe("75");
    expect(average.pickups).toBe("15");
    expect(average.meetingsBooked).toBe("1.0");
  });

  it("rates both rows off the month totals, not an average of daily rates", () => {
    const { average, total } = coldCallFooter(rows);
    expect(total.pickupPct).toBe("20.0%"); // 30 / 150
    expect(total.pickupToPtPct).toBe("46.7%"); // 14 / 30
    expect(total.pitchToBookPct).toBe("14.3%"); // 2 / 14
    expect(average.pickupPct).toBe(total.pickupPct);
    expect(average.pitchToBookPct).toBe(total.pitchToBookPct);
  });

  it("leaves the text columns out of both rollup rows", () => {
    const { average, total } = coldCallFooter(rows);
    expect(average.objections).toBeUndefined();
    expect(total.notes).toBeUndefined();
  });

  it("shows dashes for an unlogged month rather than a fabricated zero", () => {
    const { average, total } = coldCallFooter([emptyColdCallRow(), emptyColdCallRow()]);
    for (const cells of [average, total]) {
      expect(cells.callsMade).toBe("-");
      expect(cells.pickups).toBe("-");
      expect(cells.passThrough).toBe("-");
      expect(cells.meetingsBooked).toBe("-");
      expect(cells.pickupPct).toBe("-");
      expect(cells.pitchToBookPct).toBe("-");
    }
  });

  it("reports a real zero once a day is logged", () => {
    const { total } = coldCallFooter([day("40", "0", "0", "0")]);
    expect(total.callsMade).toBe("40");
    expect(total.pickups).toBe("0");
    expect(total.pickupPct).toBe("0.0%");
    // No pickups means no pass-through denominator: dash, not 0%.
    expect(total.pickupToPtPct).toBe("-");
  });
});

describe("summarizeColdCallMonth", () => {
  it("summarizes month to date with booking measured per dial", () => {
    const s = summarizeColdCallMonth([day("100", "20", "10", "2"), day("100", "10", "4", "1")]);
    expect(s.filledDays).toBe(2);
    expect(s.subtitle).toBe("2 days logged this month");
    expect(s.callsMade).toBe("200");
    expect(s.pickupPct).toBe("15.0%"); // 30 / 200
    expect(s.pickupSub).toBe("30 of 200");
    expect(s.meetingsBooked).toBe("3");
    expect(s.bookingPct).toBe("1.5%"); // 3 booked per 200 dials
  });

  it("says a single day in the singular", () => {
    expect(summarizeColdCallMonth([day("60", "9", "3", "0")]).subtitle).toBe(
      "1 day logged this month",
    );
  });

  it("prompts instead of showing zeros when nothing is logged", () => {
    const s = summarizeColdCallMonth([emptyColdCallRow(), emptyColdCallRow()]);
    expect(s.filledDays).toBe(0);
    expect(s.subtitle).toBe("No days logged yet. Type into any row to start.");
    expect(s.callsMade).toBe("-");
    expect(s.pickupPct).toBe("-");
    expect(s.pickupSub).toBe("no dials logged");
    expect(s.meetingsBooked).toBe("-");
    expect(s.bookingPct).toBe("-");
    expect(s.callsOnPace).toBe(false);
    expect(s.pickupOnPace).toBe(false);
    expect(s.bookingOnPace).toBe(false);
  });

  it("flags the pace chips against the benchmarks", () => {
    const onPace = summarizeColdCallMonth([day("120", "24", "10", "2")]);
    expect(onPace.callsOnPace).toBe(true); // 120 dials/day >= 100
    expect(onPace.pickupOnPace).toBe(true); // 20% >= 15%
    expect(onPace.bookingOnPace).toBe(true); // 1.67% >= 1%

    const offPace = summarizeColdCallMonth([day("40", "4", "1", "0")]);
    expect(offPace.callsOnPace).toBe(false);
    expect(offPace.pickupOnPace).toBe(false);
    expect(offPace.bookingOnPace).toBe(false);
  });
});
