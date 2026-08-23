import { describe, it, expect } from "vitest";
import {
  SHEET_COLUMNS,
  BAND_CELLS,
  AGENCY_PAY_RATE,
  columnWidths,
  bandTotals,
  bandValues,
  sheetRow,
  formatSheetMoney,
  formatSheetPct,
  formatApptDate,
} from "./salesSheet";
import type { SheetCall } from "../../functions/lib/salesSheetRows";

function call(over: Partial<SheetCall> = {}): SheetCall {
  return {
    scheduledAt: "2026-03-09T15:30:00Z",
    name: "Jake Hauck",
    closed: false,
    showed: false,
    noShow: false,
    cancelled: false,
    revenue: null,
    cashCollected: null,
    objection: "",
    needsFollowUp: false,
    notes: "",
    ...over,
  };
}

const CLOSED = call({
  closed: true,
  showed: true,
  revenue: 24000,
  cashCollected: 2000,
});

describe("formatting, as the sheet does it", () => {
  // The sheet prints $2,000.00, never $2,000. This is a deliberate departure
  // from the old salesTracker.ts, which dropped the .00 on whole dollars.
  it("always prints two decimals on money", () => {
    expect(formatSheetMoney(2000)).toBe("$2,000.00");
    expect(formatSheetMoney(1935.5)).toBe("$1,935.50");
    expect(formatSheetMoney(0)).toBe("$0.00");
  });

  it("prints nothing for money nobody recorded", () => {
    expect(formatSheetMoney(null)).toBe("");
  });

  // The sheet shows 0.00% on an empty month rather than a dash. It is the spec
  // here, so a rate with no denominator reads 0.00% and not "-".
  it("prints two decimals and a percent sign on rates", () => {
    expect(formatSheetPct(1)).toBe("100.00%");
    expect(formatSheetPct(0)).toBe("0.00%");
    expect(formatSheetPct(0.3333)).toBe("33.33%");
  });

  it("writes the appointment date the way the sheet writes it", () => {
    const out = formatApptDate("2026-03-09T15:30:00Z", "America/New_York");
    expect(out).toBe("Monday, March 9, 2026 11:30 AM - EDT");
  });

  it("leaves the date cell empty when the calendar gave no time", () => {
    expect(formatApptDate(null, "America/New_York")).toBe("");
  });
});

describe("bandTotals", () => {
  it("gives an empty month zeroes, never a division by zero", () => {
    const t = bandTotals([]);
    expect(t.totalCalls).toBe(0);
    expect(t.closingRate).toBe(0);
    expect(t.noShowRate).toBe(0);
    expect(t.totalNoShowRate).toBe(0);
    expect(Number.isFinite(t.closingRate)).toBe(true);
  });

  it("counts one closed live call the way the sheet does", () => {
    const t = bandTotals([CLOSED]);
    expect(t.revenue).toBe(24000);
    expect(t.cashCollected).toBe(2000);
    expect(t.totalCalls).toBe(1);
    expect(t.liveCalls).toBe(1);
    expect(t.closed).toBe(1);
    expect(t.noClose).toBe(0);
    expect(t.noShows).toBe(0);
    expect(t.closingRate).toBe(1);
    expect(t.noShowRate).toBe(0);
    expect(t.agencyPay).toBe(2000 * AGENCY_PAY_RATE);
  });

  it("counts a no-show against the calendar, not against the close rate", () => {
    const t = bandTotals([call({ noShow: true })]);
    expect(t.totalCalls).toBe(1);
    expect(t.liveCalls).toBe(0);
    expect(t.noShows).toBe(1);
    expect(t.noShowRate).toBe(1);
    expect(t.totalNoShowRate).toBe(1);
    // Nobody turned up, so there was nothing to close. A close rate of 0% over
    // zero live calls would read as a failed pitch that never happened.
    expect(t.closingRate).toBe(0);
  });

  it("counts a live call that did not close as a no-close", () => {
    const t = bandTotals([call({ showed: true })]);
    expect(t.liveCalls).toBe(1);
    expect(t.noClose).toBe(1);
    expect(t.closed).toBe(0);
    expect(t.closingRate).toBe(0);
  });

  // A meeting called off in advance was never a call. Counting it would make
  // every rate on the band read low for a reason nobody can see.
  it("leaves a cancelled meeting out of Total Calls", () => {
    const t = bandTotals([call({ cancelled: true }), CLOSED]);
    expect(t.totalCalls).toBe(1);
  });

  // Nothing in the app records whether a prospect stayed the hour, so the
  // column stays at zero until something does. Jake asked for it to stay.
  it("reports no 1hr intent as zero, because nothing records it yet", () => {
    const t = bandTotals([CLOSED]);
    expect(t.noIntent).toBe(0);
    expect(t.noIntentRate).toBe(0);
  });
});

describe("bandValues", () => {
  // Keyed by the COLUMN each cell sits over, not by the metric, because the
  // band rides the table's grid. Looked up by label here so the assertion reads
  // as the thing a person sees on the page.
  function cell(values: Record<string, string>, label: string): string {
    const found = BAND_CELLS.find((c) => c.label === label);
    if (!found) throw new Error(`no band cell labelled ${label}`);
    return values[found.key];
  }

  it("renders every band cell the sheet has, formatted", () => {
    const v = bandValues(bandTotals([CLOSED]));
    expect(cell(v, "Revenue")).toBe("$24,000.00");
    expect(cell(v, "Cash Collected")).toBe("$2,000.00");
    expect(cell(v, "Total Calls")).toBe("1");
    expect(cell(v, "Closing Rate (%)")).toBe("100.00%");
    expect(cell(v, "No Show Rate (%)")).toBe("0.00%");
    expect(cell(v, "Total No Show Rate (%)")).toBe("0.00%");
    expect(cell(v, "name (operator)")).toBe("$400.00");
  });

  it("keeps the sheet's two-word label column", () => {
    const v = bandValues(bandTotals([]));
    expect(cell(v, "Calls:")).toBe("Calls Booked:");
  });
});

describe("sheetRow", () => {
  it("chips the closed call in both of the sheet's chip columns", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    expect(r.closed).toEqual({ kind: "chip", text: "Closed", fill: "#d4edbc", ink: "#11734b" });
    expect(r.calls).toEqual({ kind: "chip", text: "Live Call", fill: "#11734b", ink: "#ffffff" });
  });

  it("chips a no-show in the Calls column and leaves Closed empty", () => {
    const r = sheetRow(call({ noShow: true }), "America/New_York");
    expect(r.calls).toMatchObject({ kind: "chip", text: "No Show" });
    expect(r.closed).toEqual({ kind: "text", text: "" });
  });

  it("chips a follow up as Yes", () => {
    const r = sheetRow(call({ needsFollowUp: true }), "America/New_York");
    expect(r.needsFollowUp).toMatchObject({ kind: "chip", text: "Yes" });
  });

  // The columns with nowhere to read from yet render an unset dropdown, exactly
  // as they look in the sheet, rather than a blank that reads as a bug.
  it("renders an empty chip in the columns nothing feeds yet", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    expect(r.closer).toEqual({ kind: "empty-chip" });
    expect(r.setBy).toEqual({ kind: "empty-chip" });
    expect(r.paymentsComplete).toEqual({ kind: "empty-chip" });
  });

  it("leaves the free-text columns nothing feeds yet blank", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    for (const key of ["postCallForm", "paymentType", "recordingLink", "paymentStatus"]) {
      expect(r[key]).toEqual({ kind: "text", text: "" });
    }
  });

  it("fills every column the schema declares", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    for (const col of SHEET_COLUMNS) expect(r[col.key]).toBeDefined();
  });

  it("carries money, notes and the objection through", () => {
    const r = sheetRow(
      call({ cashCollected: 2000, revenue: 24000, notes: "partner call", objection: "Bad timing" }),
      "America/New_York",
    );
    expect(r.cashCollected).toEqual({ kind: "text", text: "$2,000.00" });
    expect(r.revenue).toEqual({ kind: "text", text: "$24,000.00" });
    expect(r.callNotes).toEqual({ kind: "text", text: "partner call" });
    expect(r.objection).toEqual({ kind: "text", text: "Bad timing" });
  });

  it("pays the agency its share of the cash, and nothing on a call with none", () => {
    expect(sheetRow(CLOSED, "UTC").agencyPay).toEqual({ kind: "text", text: "$400.00" });
    expect(sheetRow(call(), "UTC").agencyPay).toEqual({ kind: "text", text: "" });
  });
});

describe("the schema Jake asked for", () => {
  it("has seventeen columns", () => {
    expect(SHEET_COLUMNS).toHaveLength(17);
  });

  // The four Jake struck off. A column quietly surviving a decision is exactly
  // what this test exists to catch.
  it("carries no setter, closer, creator or after-fees column", () => {
    const keys = SHEET_COLUMNS.map((c) => c.key);
    expect(keys).not.toContain("setterPay");
    expect(keys).not.toContain("closerPay");
    expect(keys).not.toContain("creatorPay");
    expect(keys).not.toContain("ccAfterFees");
    expect(keys).toContain("agencyPay");
  });

  it("carries no per-person pay total but the operator's", () => {
    const labels = BAND_CELLS.map((c) => c.label);
    expect(labels).not.toContain("name (setter)");
    expect(labels).not.toContain("name (closer)");
    expect(labels).not.toContain("name (creator/coach)");
    expect(labels).not.toContain("CC After Fees");
    expect(labels).toContain("name (operator)");
  });

  // Jake kept these three when he could have dropped them.
  it("keeps the three intent cells the sheet has", () => {
    const labels = BAND_CELLS.map((c) => c.label);
    expect(labels).toContain("No 1hr Intent");
    expect(labels).toContain("No 1hr Intent (%)");
    expect(labels).toContain("Total No Show Rate (%)");
  });

  it("puts every band cell over a real column", () => {
    const keys = new Set(SHEET_COLUMNS.map((c) => c.key));
    for (const cell of BAND_CELLS) expect(keys.has(cell.key)).toBe(true);
  });

  it("puts at most one band cell over each column", () => {
    const seen = new Set(BAND_CELLS.map((c) => c.key));
    expect(seen.size).toBe(BAND_CELLS.length);
  });
});

// Jake has to be able to read the whole sheet without scrolling sideways, which
// is only true while the columns add up to exactly the width available. A
// column added later with a pixel width, or one that pushes the total past
// 100%, brings the sideways scrollbar back.
describe("columnWidths", () => {
  it("gives one width per column", () => {
    expect(columnWidths()).toHaveLength(SHEET_COLUMNS.length);
  });

  it("adds up to the full width of the table, and no more", () => {
    const total = columnWidths().reduce((sum, w) => sum + Number.parseFloat(w), 0);
    expect(total).toBeCloseTo(100, 2);
  });

  it("gives the appointment date the widest column, because it holds the longest value", () => {
    const widths = columnWidths().map((w) => Number.parseFloat(w));
    expect(Math.max(...widths)).toBe(widths[0]);
  });
});
