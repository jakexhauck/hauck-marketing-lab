import { describe, it, expect } from "vitest";
import type { DerivedSalesDay } from "../../functions/lib/salesDataRollup";
import {
  SALES_COLUMNS,
  salesRates,
  formatMoney,
  formatNames,
  countsFor,
  emptyCounts,
  isDayWorked,
  computeSalesRow,
  computeSalesRollup,
} from "./salesTracker";

// The Sales Data schema case for the shared daily-funnel engine (the generic
// month/rate helpers are covered in ./trackerMonth.test.ts, and the meeting ->
// day counting in functions/lib/salesDataRollup.test.ts). What matters here is
// the four funnel rates, that a zero denominator never becomes a fake 0%, that
// a day with no meetings renders blank rather than zeroed, and that the footer
// totals before it divides.

function day(over: Partial<DerivedSalesDay> = {}): DerivedSalesDay {
  return {
    onCalendar: 0,
    cancelled: 0,
    awaiting: 0,
    decided: 0,
    taken: 0,
    qualified: 0,
    closed: 0,
    cash: 0,
    names: [],
    ...over,
  };
}

describe("SALES_COLUMNS", () => {
  it("has nothing typeable on it", () => {
    // The whole point of the surface: every count is measured from a meeting,
    // so an "input" column here would be a cell somebody could disagree with
    // the CRM in.
    expect(SALES_COLUMNS.every((c) => c.kind === "computed")).toBe(true);
  });

  it("fills every column it declares", () => {
    // computeSalesRow is the only thing that writes a cell, so a column with no
    // key in it renders a permanent "-".
    const keys = SALES_COLUMNS.map((c) => c.key).sort();
    const filled = Object.keys(computeSalesRow(day({ onCalendar: 1 }))).sort();
    expect(filled).toEqual(keys);
  });

  it("uses no em dash in any label", () => {
    for (const c of SALES_COLUMNS) expect(c.label).not.toContain("—");
  });
});

describe("salesRates", () => {
  it("divides the show rate by the DECIDED meetings, not the calendar", () => {
    // Four booked, one still unanswered, three recorded of which two turned up.
    // 2/3, not 2/4: a meeting nobody has recorded is not a no-show, and this is
    // the one line that keeps this page agreeing with Sales Calls.
    const rates = salesRates(
      countsFor(day({ onCalendar: 4, awaiting: 1, decided: 3, taken: 2 })),
    );
    expect(rates.showUpPct).toBeCloseTo(66.67, 1);
  });

  it("computes the three rates that hang off calls taken", () => {
    const rates = salesRates(
      countsFor(day({ onCalendar: 5, decided: 5, taken: 4, qualified: 3, closed: 2 })),
    );
    expect(rates.qualifiedPct).toBe(75);
    expect(rates.closePct).toBe(50);
    expect(rates.closeFromQualifiedPct).toBeCloseTo(66.67, 1);
  });

  it("returns null, never 0%, for a rate with no denominator", () => {
    // A day nobody has recorded has no show rate. Rendering it as 0% would read
    // as "everybody stood us up".
    const rates = salesRates(emptyCounts());
    expect(rates.showUpPct).toBeNull();
    expect(rates.qualifiedPct).toBeNull();
    expect(rates.closePct).toBeNull();
    expect(rates.closeFromQualifiedPct).toBeNull();
  });
});

describe("computeSalesRow", () => {
  it("renders a day with no meetings entirely blank", () => {
    // Not zeroes. An empty row is "nothing was booked"; a row of zeroes reads
    // like a day that was worked and produced nothing.
    const cells = computeSalesRow(null);
    expect(Object.values(cells).every((v) => v === "")).toBe(true);
    expect(Object.values(computeSalesRow(day())).every((v) => v === "")).toBe(true);
  });

  it("writes the counts and the rates for a day that had meetings", () => {
    const cells = computeSalesRow(
      day({
        onCalendar: 3,
        decided: 2,
        taken: 2,
        qualified: 1,
        closed: 1,
        awaiting: 1,
        cash: 4500,
        names: ["Acme Roofing", "Baker Co", "Nolan Bros"],
      }),
    );
    expect(cells.onCalendar).toBe("3");
    expect(cells.taken).toBe("2");
    expect(cells.awaiting).toBe("1");
    expect(cells.showUpPct).toBe("100.0%");
    expect(cells.closePct).toBe("50.0%");
    expect(cells.cash).toBe("$4,500");
    expect(cells.names).toBe("Acme Roofing, Baker Co +1");
  });

  it("leaves a clean day's exception columns blank rather than zeroed", () => {
    // Cancelled and Awaiting are exceptions, not measurements: a day with
    // neither should read as clean, not as two zeroes to scan past.
    const cells = computeSalesRow(day({ onCalendar: 2, decided: 2, taken: 2 }));
    expect(cells.cancelled).toBe("");
    expect(cells.awaiting).toBe("");
    // A measured zero still prints: nobody closed, and that is a fact.
    expect(cells.closed).toBe("0");
  });
});

describe("formatNames", () => {
  it("lists a short day in full and truncates a long one with a count", () => {
    expect(formatNames([])).toBe("");
    expect(formatNames(["Acme"])).toBe("Acme");
    expect(formatNames(["Acme", "Baker"])).toBe("Acme, Baker");
    expect(formatNames(["Acme", "Baker", "Nolan", "Fox"])).toBe("Acme, Baker +2");
  });
});

describe("isDayWorked", () => {
  it("counts a day that had a meeting on the calendar, cancelled or not", () => {
    expect(isDayWorked(countsFor(day({ onCalendar: 1, cancelled: 1 })))).toBe(true);
    expect(isDayWorked(emptyCounts())).toBe(false);
  });
});

describe("computeSalesRollup", () => {
  const days = [
    day({ onCalendar: 2, decided: 2, taken: 2, qualified: 2, closed: 1, cash: 3000 }),
    day({
      onCalendar: 4,
      cancelled: 1,
      awaiting: 1,
      decided: 2,
      taken: 1,
      qualified: 1,
      closed: 1,
      cash: 1500,
    }),
  ];

  it("totals the counts across the month", () => {
    const { totals } = computeSalesRollup(days);
    expect(totals.onCalendar).toBe(6);
    expect(totals.decided).toBe(4);
    expect(totals.taken).toBe(3);
    expect(totals.closed).toBe(2);
    expect(totals.cash).toBe(4500);
  });

  it("computes the footer rates from the month's totals, not the day averages", () => {
    // 3 taken of 4 decided = 75%. Close rate is the one that proves totals were
    // used: 2/3 = 66.7%, where averaging the two days' own rates (50% and 100%)
    // would say 75%.
    const { total, rates } = computeSalesRollup(days);
    expect(rates.closePct).toBeCloseTo(66.67, 1);
    expect(total.closePct).toBe("66.7%");
    expect(total.showUpPct).toBe("75.0%");
  });

  it("averages per WORKED day, not per calendar day", () => {
    const rollup = computeSalesRollup([...days, day(), day(), day()]);
    expect(rollup.workedDays).toBe(2);
    // 6 meetings over the 2 days that had any, not over all 5 rows.
    expect(rollup.average.onCalendar).toBe("3.0");
  });

  it("survives a month with nothing in it", () => {
    const rollup = computeSalesRollup([]);
    expect(rollup.workedDays).toBe(0);
    expect(rollup.totals.onCalendar).toBe(0);
    // No denominator anywhere, so every rate is "-" rather than a flattering 0%.
    expect(rollup.total.showUpPct).toBe("-");
    expect(rollup.total.closePct).toBe("-");
  });
});

describe("formatMoney", () => {
  it("keeps whole dollars whole and cents when there are cents", () => {
    expect(formatMoney(4500)).toBe("$4,500");
    expect(formatMoney(4500.5)).toBe("$4,500.50");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(null)).toBe("-");
  });
});
