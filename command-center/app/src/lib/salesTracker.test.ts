import { describe, it, expect } from "vitest";
import type { TrackerRow } from "../components/admin/tracker/DailyTracker";
import {
  SALES_COLUMNS,
  toMoney,
  readCounts,
  salesRates,
  formatMoney,
  isSalesRowFilled,
  computeSalesRow,
  computeSalesRollup,
} from "./salesTracker";

// The Sales Data schema case for the shared daily-funnel engine (the generic
// month/rate helpers are covered in ./trackerMonth.test.ts). What matters here
// is the four funnel rates, that a zero denominator never becomes a fake 0%, and
// that the footer totals before it divides.

describe("SALES_COLUMNS", () => {
  it("keys every editable column to its API field name", () => {
    // The component sends the column key straight to the endpoint as a PATCH
    // field, so a drift here is a silent save failure.
    const editable = SALES_COLUMNS.filter((c) => c.kind !== "computed").map(
      (c) => c.key,
    );
    expect(editable).toEqual([
      "callsOnCalendar",
      "rescheduledCancelled",
      "callsTaken",
      "qualified",
      "closed",
      "cashCollected",
      "notes",
    ]);
  });

  it("puts every rate the row math produces in the table", () => {
    const computed = SALES_COLUMNS.filter((c) => c.kind === "computed").map(
      (c) => c.key,
    );
    expect(computed).toEqual([
      "showUpPct",
      "qualifiedPct",
      "closePct",
      "closeFromQualifiedPct",
    ]);
    expect(Object.keys(computeSalesRow({})).sort()).toEqual(computed.sort());
  });

  it("uses no em dash in any label", () => {
    for (const c of SALES_COLUMNS) expect(c.label).not.toContain("—");
  });
});

describe("toMoney", () => {
  it("parses what a human types into a cash cell", () => {
    expect(toMoney("4500")).toBe(4500);
    expect(toMoney("4500.50")).toBe(4500.5);
    expect(toMoney("$4,500.00")).toBe(4500);
    expect(toMoney(1200)).toBe(1200);
  });

  it("treats blank and garbage as 0", () => {
    expect(toMoney("")).toBe(0);
    expect(toMoney("   ")).toBe(0);
    expect(toMoney("lots")).toBe(0);
    expect(toMoney(null)).toBe(0);
    expect(toMoney(undefined)).toBe(0);
  });
});

describe("salesRates", () => {
  const counts = readCounts({
    callsOnCalendar: "10",
    rescheduledCancelled: "2",
    callsTaken: "8",
    qualified: "5",
    closed: "2",
    cashCollected: "9000",
  });

  it("computes show-up as taken over booked", () => {
    expect(salesRates(counts).showUpPct).toBe(80);
  });

  it("computes qualified as qualified over taken", () => {
    expect(salesRates(counts).qualifiedPct).toBe(62.5);
  });

  it("computes the overall close rate as closed over taken", () => {
    expect(salesRates(counts).closePct).toBe(25);
  });

  it("computes the qualified close rate as closed over qualified", () => {
    expect(salesRates(counts).closeFromQualifiedPct).toBe(40);
  });

  it("returns null, not 0%, for every rate on an empty day", () => {
    const empty = salesRates(readCounts({}));
    expect(empty).toEqual({
      showUpPct: null,
      qualifiedPct: null,
      closePct: null,
      closeFromQualifiedPct: null,
    });
  });

  it("returns null only for the rates whose denominator is missing", () => {
    // Calls were booked but none were taken: show-up is a real 0%, while the
    // rates that divide by "taken" have nothing to divide by yet.
    const rates = salesRates(readCounts({ callsOnCalendar: "6", callsTaken: "0" }));
    expect(rates.showUpPct).toBe(0);
    expect(rates.qualifiedPct).toBeNull();
    expect(rates.closePct).toBeNull();
    expect(rates.closeFromQualifiedPct).toBeNull();
  });
});

describe("computeSalesRow", () => {
  it("formats each rate to one decimal", () => {
    const cells = computeSalesRow({
      callsOnCalendar: "12",
      callsTaken: "7",
      qualified: "3",
      closed: "1",
    });
    expect(cells.showUpPct).toBe("58.3%");
    expect(cells.qualifiedPct).toBe("42.9%");
    expect(cells.closePct).toBe("14.3%");
    expect(cells.closeFromQualifiedPct).toBe("33.3%");
  });

  it("renders a plain hyphen for a rate with no denominator", () => {
    const cells = computeSalesRow({});
    expect(cells.showUpPct).toBe("-");
    expect(cells.showUpPct).not.toContain("—");
  });
});

describe("formatMoney", () => {
  it("keeps whole dollars whole and cents when there are cents", () => {
    expect(formatMoney(4500)).toBe("$4,500");
    expect(formatMoney(4500.5)).toBe("$4,500.50");
    expect(formatMoney(0)).toBe("$0");
  });

  it("renders a plain hyphen for null", () => {
    expect(formatMoney(null)).toBe("-");
  });
});

describe("isSalesRowFilled", () => {
  it("counts a day with any number in it", () => {
    expect(isSalesRowFilled({ callsTaken: "3" })).toBe(true);
    expect(isSalesRowFilled({ cashCollected: "500" })).toBe(true);
  });

  it("does not count an empty day or a notes-only day", () => {
    expect(isSalesRowFilled({})).toBe(false);
    expect(isSalesRowFilled({ callsTaken: "  " })).toBe(false);
    // A note without numbers is not a logged day of selling.
    expect(isSalesRowFilled({ notes: "out sick" })).toBe(false);
  });
});

describe("computeSalesRollup", () => {
  const rows: TrackerRow[] = [
    {
      callsOnCalendar: "10",
      rescheduledCancelled: "2",
      callsTaken: "8",
      qualified: "5",
      closed: "2",
      cashCollected: "9000",
    },
    {
      callsOnCalendar: "6",
      rescheduledCancelled: "1",
      callsTaken: "4",
      qualified: "2",
      closed: "1",
      cashCollected: "3000",
    },
    {}, // an unlogged day
  ];

  it("totals every numeric column", () => {
    const { total, totals } = computeSalesRollup(rows);
    expect(totals.callsOnCalendar).toBe(16);
    expect(totals.callsTaken).toBe(12);
    expect(totals.closed).toBe(3);
    expect(total.callsTaken).toBe("12");
    expect(total.cashCollected).toBe("$12,000");
  });

  it("averages over logged days only, not the calendar", () => {
    const { average, filledDays } = computeSalesRollup(rows);
    expect(filledDays).toBe(2);
    expect(average.callsTaken).toBe("6.0"); // 12 / 2, not 12 / 3
    expect(average.cashCollected).toBe("$6,000");
  });

  it("computes the footer rates from the month totals, not an average of rates", () => {
    // Averaging the daily close rates (25% and 25%) happens to agree here, so
    // use show-up, where the two differ: 12/16 = 75%, while the daily rates are
    // 80% and 66.7% (mean 73.3%).
    const { total, rates } = computeSalesRollup(rows);
    expect(rates.showUpPct).toBe(75);
    expect(total.showUpPct).toBe("75.0%");
    expect(total.closeFromQualifiedPct).toBe("42.9%"); // 3 / 7
  });

  it("leaves the rate columns blank on the Average row", () => {
    const { average } = computeSalesRollup(rows);
    expect(average.showUpPct).toBeUndefined();
    expect(average.closePct).toBeUndefined();
  });

  it("survives an entirely empty month without dividing by zero", () => {
    const { average, total, rates, filledDays } = computeSalesRollup([{}, {}]);
    expect(filledDays).toBe(0);
    expect(average.callsTaken).toBe("-");
    expect(average.cashCollected).toBe("-");
    expect(total.callsTaken).toBe("0");
    expect(total.showUpPct).toBe("-");
    expect(rates.showUpPct).toBeNull();
  });
});
