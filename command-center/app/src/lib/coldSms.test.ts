import { describe, it, expect } from "vitest";
// The no-duplicate-math guard below reads this module's own source.
import coldSmsSource from "./coldSms.ts?raw";
import {
  computeDailyRow,
  computeDailyRollup,
  computeMonthlyRow,
  computeMonthlyRollup,
  computeScriptRow,
  computeScriptRollup,
  formatMoney,
  isDailyRowFilled,
  type Cells,
} from "./coldSms";

// Every number on the Cold SMS surface is derived here, so these tests are the
// contract for the whole page: no NaN, no Infinity, no fabricated zeros, and
// blank stays blank.

const emptyDay: Cells = { smsSent: "", positiveReplies: "", meetingsBooked: "", note: "" };

describe("computeDailyRow", () => {
  it("computes the three daily rates from the raw counts", () => {
    const cells = computeDailyRow({
      smsSent: "400",
      positiveReplies: "20",
      meetingsBooked: "2",
      note: "",
    });
    expect(cells.replyPct).toBe("5.0%");
    expect(cells.replyToBookPct).toBe("10.0%");
    expect(cells.bookToSentPct).toBe("0.5%");
  });

  it("renders a blank day as empty cells, never NaN", () => {
    const cells = computeDailyRow(emptyDay);
    expect(cells).toEqual({ replyPct: "-", replyToBookPct: "-", bookToSentPct: "-" });
    expect(JSON.stringify(cells)).not.toMatch(/NaN|Infinity/);
  });

  it("returns empty rather than dividing by a zero denominator", () => {
    // Sends logged, no replies: reply to book has nothing to divide by.
    const cells = computeDailyRow({
      smsSent: "300",
      positiveReplies: "0",
      meetingsBooked: "0",
      note: "",
    });
    expect(cells.replyPct).toBe("0.0%");
    expect(cells.replyToBookPct).toBe("-");
    expect(cells.bookToSentPct).toBe("0.0%");
  });
});

describe("isDailyRowFilled", () => {
  it("counts a day with any input, and ignores a notes-only day", () => {
    expect(isDailyRowFilled({ ...emptyDay, smsSent: "120" })).toBe(true);
    expect(isDailyRowFilled({ ...emptyDay, meetingsBooked: "1" })).toBe(true);
    expect(isDailyRowFilled({ ...emptyDay, note: "day off" })).toBe(false);
    expect(isDailyRowFilled(emptyDay)).toBe(false);
  });
});

describe("computeDailyRollup", () => {
  const rows: Cells[] = [
    { smsSent: "400", positiveReplies: "20", meetingsBooked: "2", note: "" },
    { smsSent: "200", positiveReplies: "10", meetingsBooked: "1", note: "" },
    { ...emptyDay, note: "day off" },
  ];

  it("totals the month and averages over logged days only", () => {
    const rollup = computeDailyRollup(rows);
    expect(rollup.filledDays).toBe(2);
    expect(rollup.totals).toEqual({ smsSent: 600, positiveReplies: 30, meetingsBooked: 3 });
    // 600 over 2 logged days, not over the 3 rows on screen.
    expect(rollup.average.smsSent).toBe("300");
    expect(rollup.average.positiveReplies).toBe("15");
    expect(rollup.average.meetingsBooked).toBe("1.5");
    expect(rollup.total.smsSent).toBe("600");
    expect(rollup.total.meetingsBooked).toBe("3");
  });

  it("recomputes the aggregate rates from the sums", () => {
    const rollup = computeDailyRollup(rows);
    expect(rollup.rates.replyPct).toBeCloseTo(5, 6);
    expect(rollup.rates.replyToBookPct).toBeCloseTo(10, 6);
    expect(rollup.rates.bookToSentPct).toBeCloseTo(0.5, 6);
    expect(rollup.total.replyPct).toBe("5.0%");
    expect(rollup.average.bookToSentPct).toBe("0.5%");
  });

  it("shows an all-empty month as zero totals and empty rates", () => {
    const rollup = computeDailyRollup([emptyDay, emptyDay, emptyDay]);
    expect(rollup.filledDays).toBe(0);
    expect(rollup.totals).toEqual({ smsSent: 0, positiveReplies: 0, meetingsBooked: 0 });
    expect(rollup.average.smsSent).toBe("-");
    expect(rollup.total.smsSent).toBe("0");
    expect(rollup.total.replyPct).toBe("-");
  });

  it("handles a month with no rows at all", () => {
    const rollup = computeDailyRollup([]);
    expect(rollup.filledDays).toBe(0);
    expect(rollup.average.replyPct).toBe("-");
  });
});

describe("computeMonthlyRow", () => {
  const july: Cells = {
    totalSmsSent: "9200",
    vaCost: "1200",
    callsBooked: "34",
    callsShowed: "22",
    smsCost: "460",
    newClients: "5",
    cashCollected: "14500",
    ltv: "4200",
  };

  it("computes the full economics chain for a logged month", () => {
    const c = computeMonthlyRow(july);
    expect(c.showRate).toBeCloseTo((22 / 34) * 100, 6);
    expect(c.smsPerClient).toBeCloseTo(1840, 6);
    // Total cost is VA plus SMS spend.
    expect(c.totalCost).toBeCloseTo(1660, 6);
    expect(c.costPerCall).toBeCloseTo(1660 / 34, 6);
    expect(c.costPerShowed).toBeCloseTo(1660 / 22, 6);
    expect(c.cac).toBeCloseTo(332, 6);
    expect(c.roi).toBeCloseTo(((14500 - 1660) / 1660) * 100, 6);
  });

  it("reports a negative ROI when the month collected less than it spent", () => {
    const c = computeMonthlyRow({ ...july, vaCost: "1000", smsCost: "500", cashCollected: "300" });
    expect(c.roi).toBeCloseTo(-80, 6);
  });

  it("returns null everywhere a denominator is zero, including totalCost 0", () => {
    const c = computeMonthlyRow({
      totalSmsSent: "",
      vaCost: "",
      callsBooked: "",
      callsShowed: "",
      smsCost: "",
      newClients: "",
      cashCollected: "",
      ltv: "",
    });
    expect(c.showRate).toBeNull();
    expect(c.smsPerClient).toBeNull();
    // No cost was entered, so the row stays blank rather than claiming $0 spend.
    expect(c.totalCost).toBeNull();
    expect(c.costPerCall).toBeNull();
    expect(c.costPerShowed).toBeNull();
    expect(c.cac).toBeNull();
    // totalCost 0 gives ROI nothing to measure against.
    expect(c.roi).toBeNull();
  });

  it("keeps a zero-dollar month with real spend distinct from a blank month", () => {
    const c = computeMonthlyRow({ ...july, vaCost: "0", smsCost: "0" });
    expect(c.totalCost).toBe(0);
    expect(c.roi).toBeNull();
  });
});

describe("computeMonthlyRollup", () => {
  const rows: Cells[] = [
    {
      totalSmsSent: "9200",
      vaCost: "1200",
      callsBooked: "34",
      callsShowed: "22",
      smsCost: "460",
      newClients: "5",
      cashCollected: "14500",
      ltv: "4200",
    },
    {
      totalSmsSent: "4800",
      vaCost: "800",
      callsBooked: "16",
      callsShowed: "10",
      smsCost: "240",
      newClients: "3",
      cashCollected: "6000",
      ltv: "",
    },
  ];

  it("sums every input column", () => {
    const { totals } = computeMonthlyRollup(rows);
    expect(totals).toEqual({
      totalSmsSent: 14000,
      vaCost: 2000,
      callsBooked: 50,
      callsShowed: 32,
      smsCost: 700,
      newClients: 8,
      cashCollected: 20500,
    });
  });

  it("recomputes the footer ratios from the sums, not from the row rates", () => {
    const { computed } = computeMonthlyRollup(rows);
    expect(computed.showRate).toBeCloseTo((32 / 50) * 100, 6);
    expect(computed.totalCost).toBeCloseTo(2700, 6);
    expect(computed.cac).toBeCloseTo(2700 / 8, 6);
    expect(computed.roi).toBeCloseTo(((20500 - 2700) / 2700) * 100, 6);
  });

  it("averages LTV over the months that recorded one", () => {
    // Only the first row has an LTV, so the blank second row must not halve it.
    expect(computeMonthlyRollup(rows).ltvAverage).toBeCloseTo(4200, 6);
    const both = computeMonthlyRollup([rows[0], { ...rows[1], ltv: "2000" }]);
    expect(both.ltvAverage).toBeCloseTo(3100, 6);
    // A zero LTV is not a recorded LTV.
    const zeroed = computeMonthlyRollup([{ ...rows[0], ltv: "0" }, { ...rows[1], ltv: "0" }]);
    expect(zeroed.ltvAverage).toBeNull();
  });

  it("shows an empty table as zeros and no LTV", () => {
    const rollup = computeMonthlyRollup([]);
    expect(rollup.totals.totalSmsSent).toBe(0);
    expect(rollup.ltvAverage).toBeNull();
    expect(rollup.computed.roi).toBeNull();
  });
});

describe("computeScriptRow", () => {
  it("computes positive reply % and booking %", () => {
    const c = computeScriptRow({
      totalSent: "500",
      positiveReplies: "38",
      callsBooked: "9",
      clientsClosed: "2",
    });
    expect(c.replyPct).toBeCloseTo(7.6, 6);
    expect(c.bookingPct).toBeCloseTo(1.8, 6);
  });

  it("divides booking % by total sent, not by replies", () => {
    // The A/B test asks how many sends an opener needs to land a call, so the
    // denominator is Total Sent. 9 of 500 is 1.8%, not 9 of 38 (23.7%).
    const c = computeScriptRow({ totalSent: "500", positiveReplies: "38", callsBooked: "9" });
    expect(c.bookingPct).toBeCloseTo((9 / 500) * 100, 6);
    expect(c.bookingPct).not.toBeCloseTo((9 / 38) * 100, 1);
  });

  it("returns null rates when nothing was sent", () => {
    const c = computeScriptRow({ totalSent: "", positiveReplies: "", callsBooked: "" });
    expect(c.replyPct).toBeNull();
    expect(c.bookingPct).toBeNull();
  });
});

describe("computeScriptRollup", () => {
  const rows: Cells[] = [
    { totalSent: "500", positiveReplies: "38", callsBooked: "9", clientsClosed: "2" },
    { totalSent: "500", positiveReplies: "31", callsBooked: "7", clientsClosed: "2" },
  ];

  it("sums the variations and rates them off the sums", () => {
    const { totals, computed } = computeScriptRollup(rows);
    expect(totals).toEqual({
      totalSent: 1000,
      positiveReplies: 69,
      callsBooked: 16,
      clientsClosed: 4,
    });
    expect(computed.replyPct).toBeCloseTo(6.9, 6);
    expect(computed.bookingPct).toBeCloseTo(1.6, 6);
  });

  it("shows an empty test as zeros and no rates", () => {
    const { totals, computed } = computeScriptRollup([]);
    expect(totals.totalSent).toBe(0);
    expect(computed.replyPct).toBeNull();
    expect(computed.bookingPct).toBeNull();
  });
});

describe("formatMoney", () => {
  it("renders whole dollars and an empty glyph for null", () => {
    expect(formatMoney(1660)).toBe("$1,660");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(-80.4)).toBe("$-80");
    expect(formatMoney(null)).toBe("-");
  });
});

describe("shared math", () => {
  it("reuses trackerMonth's helpers instead of re-implementing them", () => {
    expect(coldSmsSource).toMatch(/from "\.\/trackerMonth"/);
    // No local copy of the primitives the shared engine already owns.
    for (const helper of ["pct", "safeDivide", "formatPct", "formatNum", "toInt"]) {
      expect(coldSmsSource).not.toMatch(new RegExp(`function ${helper}\\s*\\(`));
      expect(coldSmsSource).not.toMatch(new RegExp(`const ${helper}\\s*=`));
    }
  });
});
