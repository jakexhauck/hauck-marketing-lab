import { describe, it, expect } from "vitest";
import {
  SHEET_COLUMNS,
  HEADLINE_TILES,
  FUNNEL_CELLS,
  columnWidths,
  bandTotals,
  outcomeFor,
  sheetRow,
  formatMoney,
  formatPct,
  formatApptDate,
  zoneLabel,
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
    unqualified: false,
    noClose: false,
    revenue: null,
    cashCollected: null,
    objection: "",
    needsFollowUp: false,
    notes: "",
    postCallFormUrl: "",
    paymentType: "",
    recordingLink: "",
    ...over,
  };
}

const CLOSED = call({
  closed: true,
  showed: true,
  revenue: 24000,
  cashCollected: 2000,
});

describe("formatting, in the app's own conventions", () => {
  // A column of "$4,500.00" is noise. This is the convention every other table
  // in the Command Center uses, and following it is most of what makes the page
  // look like it belongs here.
  it("keeps whole dollars whole and cents where there are any", () => {
    expect(formatMoney(2000)).toBe("$2,000");
    expect(formatMoney(1935.5)).toBe("$1,935.50");
    expect(formatMoney(0)).toBe("$0");
  });

  it("prints nothing for money nobody recorded", () => {
    expect(formatMoney(null)).toBe("");
  });

  it("prints a rate without trailing zeroes", () => {
    expect(formatPct(1)).toBe("100%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(0.3333)).toBe("33.3%");
  });

  // A month with no calls in it did not close 0% of them. There was nothing to
  // close, and printing 0% would report a failure that never happened.
  it("prints a dash for a rate with no denominator", () => {
    expect(formatPct(null)).toBe("-");
  });

  it("writes the appointment date short, without the year or the zone", () => {
    expect(formatApptDate("2026-03-09T15:30:00Z", "America/New_York")).toBe("Mon 9 Mar, 11:30 AM");
  });

  it("leaves the date cell empty when the calendar gave no time", () => {
    expect(formatApptDate(null, "America/New_York")).toBe("");
  });

  // Read off a call in the month, so a month viewed in winter is not labelled
  // with summer's abbreviation.
  it("names the zone from the month being read", () => {
    expect(zoneLabel("America/New_York", "2026-03-09T15:30:00Z")).toBe("EDT");
    expect(zoneLabel("America/New_York", "2026-01-09T15:30:00Z")).toBe("EST");
  });
});

describe("bandTotals", () => {
  it("gives an empty month zeroes, and no rate at all", () => {
    const t = bandTotals([]);
    expect(t.totalCalls).toBe(0);
    expect(t.cancelled).toBe(0);
    expect(t.unqualified).toBe(0);
    expect(t.followUp).toBe(0);
    expect(t.closingRate).toBeNull();
    expect(t.noShowRate).toBeNull();
  });

  it("counts one closed live call", () => {
    const t = bandTotals([CLOSED]);
    expect(t.revenue).toBe(24000);
    expect(t.cashCollected).toBe(2000);
    expect(t.totalCalls).toBe(1);
    expect(t.liveCalls).toBe(1);
    expect(t.closed).toBe(1);
    expect(t.noClose).toBe(0);
    expect(t.closingRate).toBe(1);
    expect(t.noShowRate).toBe(0);
  });

  it("counts a no-show against the calendar, not against the close rate", () => {
    const t = bandTotals([call({ noShow: true })]);
    expect(t.totalCalls).toBe(1);
    expect(t.liveCalls).toBe(0);
    expect(t.noShows).toBe(1);
    expect(t.noShowRate).toBe(1);
    // Nobody turned up, so there was nothing to close.
    expect(t.closingRate).toBeNull();
  });

  // A meeting called off in advance was never a call. Counting it would make
  // every rate read low for a reason nobody can see.
  it("counts a cancelled meeting on its own, and not as a call", () => {
    const t = bandTotals([call({ cancelled: true }), CLOSED]);
    expect(t.cancelled).toBe(1);
    expect(t.totalCalls).toBe(1);
    expect(t.liveCalls).toBe(1);
    expect(t.noShowRate).toBe(0);
  });

  it("counts the four things a live call becomes, each in one place", () => {
    const t = bandTotals([
      CLOSED,
      call({ showed: true, needsFollowUp: true }),
      call({ showed: true, noClose: true }),
      call({ showed: true, unqualified: true }),
    ]);
    expect(t.liveCalls).toBe(4);
    expect(t.closed).toBe(1);
    expect(t.followUp).toBe(1);
    expect(t.noClose).toBe(1);
    expect(t.unqualified).toBe(1);
    // The invariant the strip rests on: the four buckets add up to every call
    // that happened, so nothing is counted twice and nothing is lost.
    expect(t.closed + t.followUp + t.noClose + t.unqualified).toBe(t.liveCalls);
    expect(t.closingRate).toBe(0.25);
  });

  // Unqualified is a fact about the list and No-Close is a fact about the
  // pitch. Merging them hides which of the two needs fixing.
  it("does not count an unqualified call or a follow up as a no-close", () => {
    expect(bandTotals([call({ showed: true, unqualified: true })]).noClose).toBe(0);
    expect(bandTotals([call({ showed: true, needsFollowUp: true })]).noClose).toBe(0);
  });
});

describe("outcomeFor", () => {
  it("names each outcome once, in its own tone", () => {
    expect(outcomeFor(CLOSED)).toEqual({ label: "Closed", tone: "good" });
    expect(outcomeFor(call({ showed: true, needsFollowUp: true }))).toEqual({
      label: "Follow-Up",
      tone: "info",
    });
    expect(outcomeFor(call({ showed: true, noClose: true }))).toEqual({
      label: "No-Close",
      tone: "warn",
    });
    expect(outcomeFor(call({ showed: true, unqualified: true }))).toEqual({
      label: "Unqualified",
      tone: "muted",
    });
    expect(outcomeFor(call({ noShow: true }))).toEqual({ label: "No Show", tone: "bad" });
  });

  // Both outrank anything recorded against the meeting: they are facts about
  // whether it happened at all.
  it("puts cancelled ahead of everything, and no-show ahead of the rest", () => {
    expect(outcomeFor(call({ cancelled: true, closed: true, showed: true })).label).toBe(
      "Cancelled",
    );
    expect(outcomeFor(call({ noShow: true, unqualified: true })).label).toBe("No Show");
  });

  // A meeting nobody has recorded is not a no-show, and showing it as one would
  // invent a failure that has not happened yet.
  it("calls an unrecorded meeting awaiting, not a no-show", () => {
    expect(outcomeFor(call())).toEqual({ label: "Awaiting", tone: "muted" });
  });
});

describe("sheetRow", () => {
  it("carries the date, the name and the outcome", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    expect(r.date).toBe("Mon 9 Mar, 11:30 AM");
    expect(r.name).toBe("Jake Hauck");
    expect(r.outcome.label).toBe("Closed");
  });

  it("carries money, notes and the objection through", () => {
    const r = sheetRow(
      call({ cashCollected: 2000, revenue: 24000, notes: "partner call", objection: "Bad timing" }),
      "America/New_York",
    );
    expect(r.cells.cashCollected).toBe("$2,000");
    expect(r.cells.revenue).toBe("$24,000");
    expect(r.cells.notes).toBe("partner call");
    expect(r.cells.objection).toBe("Bad timing");
  });

  // A row nobody has dispositioned yet. Empty cells and no link, so the column
  // reads as waiting, not as broken.
  it("renders dashes until the form's answers arrive", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    expect(r.cells.paymentType).toBe("");
    expect(r.cells.recordingLink).toBe("");
    expect(r.formUrl).toBeUndefined();
  });

  // The disposition form feeds all three (sales-disposition-form.md). The link
  // is carried on the row rather than in a cell: it renders as an Open form
  // control, not as text.
  it("carries the form's stamps through to the cells", () => {
    const stamped = call({
      paymentType: "Stripe",
      recordingLink: "https://drive.example/rec/1",
      postCallFormUrl:
        "https://link.hauckmarketing.com/widget/form/RaoIfnclY5sytH5ndisi?phone=%2B17343010570",
    });
    const r = sheetRow(stamped, "America/New_York");
    expect(r.cells.paymentType).toBe("Stripe");
    expect(r.cells.recordingLink).toBe("https://drive.example/rec/1");
    expect(r.formUrl).toBe(stamped.postCallFormUrl);
  });

  // A cancelled meeting needs no form worked, so its link goes quiet even when
  // one is stamped; the pill already says what happened to the slot.
  it("suppresses the form link on a cancelled row", () => {
    const r = sheetRow(
      call({ cancelled: true, postCallFormUrl: "https://link.hauckmarketing.com/widget/form/x" }),
      "America/New_York",
    );
    expect(r.formUrl).toBeUndefined();
  });

  it("fills every column the table renders from cells", () => {
    const r = sheetRow(CLOSED, "America/New_York");
    // The first three are drawn from date, name and outcome directly.
    for (const col of SHEET_COLUMNS.slice(3)) expect(r.cells[col.key]).toBeDefined();
  });
});

describe("the schema Jake asked for", () => {
  // Every column he has struck off, by key. A column quietly surviving a
  // decision is exactly what this test exists to catch.
  it("carries no struck-off column", () => {
    const keys = SHEET_COLUMNS.map((c) => c.key);
    for (const gone of [
      "setterPay",
      "closerPay",
      "creatorPay",
      "ccAfterFees",
      "setBy",
      "closer",
      "agencyPay",
      "paymentsComplete",
      "paymentStatus",
    ]) {
      expect(keys).not.toContain(gone);
    }
  });

  // Nothing records whether a prospect stayed the hour, so both cells read zero
  // for ever. Total No Show Rate went with them: it was no-shows plus intent,
  // which without intent is No Show Rate printed twice.
  it("carries no 1hr intent metric", () => {
    const labels = [...HEADLINE_TILES, ...FUNNEL_CELLS].map((c) => c.label);
    expect(labels).not.toContain("No 1hr Intent");
    expect(labels).not.toContain("No 1hr Intent (%)");
    expect(labels).not.toContain("Total No Show Rate (%)");
  });

  it("shows everything Jake asked to track", () => {
    const labels = [...HEADLINE_TILES, ...FUNNEL_CELLS].map((c) => c.label);
    for (const wanted of [
      "Cancelled",
      "Unqualified",
      "No Shows",
      "No-Close",
      "Follow-Up",
      "Closed",
      "Closing Rate",
      "No Show Rate",
    ]) {
      expect(labels).toContain(wanted);
    }
  });
});

// Jake has to be able to read the whole month without scrolling sideways, which
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

  // The Name column, not the Date one. It holds a company name, and companies
  // are called things like "Good Helpers Today Heating Cooling and Labor
  // Services LLC". The date is a fixed-length stamp and cannot grow.
  it("gives the name the widest column, because it holds the longest value", () => {
    const widths = columnWidths().map((w) => Number.parseFloat(w));
    expect(Math.max(...widths)).toBe(widths[1]);
  });
});
