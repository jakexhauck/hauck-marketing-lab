import { describe, it, expect } from "vitest";
import { toSheetCall, callsInMonth, type SalesCallRow } from "./salesSheetRows";

// A meeting, with everything defaulted to the boring case. Each test overrides
// only the field it is about, so a test reads as the one fact it asserts.
function call(over: Partial<SalesCallRow> = {}): SalesCallRow {
  return {
    scheduledAt: "2026-03-09T15:30:00Z",
    appointmentStatus: "confirmed",
    outcome: null,
    cashCollected: null,
    deal: null,
    reason: null,
    scratchpad: "",
    prospectName: "Jake Hauck",
    businessName: "Hauck Marketing",
    ...over,
  };
}

describe("toSheetCall", () => {
  it("puts the whole contract in Revenue when the term is known", () => {
    const row = toSheetCall(
      call({ outcome: "closed", deal: { monthly: 2000, months: 12 }, cashCollected: 2000 }),
    );
    expect(row.revenue).toBe(24000);
    expect(row.cashCollected).toBe(2000);
    expect(row.closed).toBe(true);
    expect(row.showed).toBe(true);
  });

  // Month-to-month has no end, so it has no contract value. A guess printed in
  // the Revenue column would be a guess wearing a total's clothes.
  it("leaves Revenue empty on a month-to-month close", () => {
    const row = toSheetCall(call({ outcome: "closed", deal: { monthly: 2000, months: null } }));
    expect(row.revenue).toBeNull();
  });

  it("leaves Revenue empty on a close where nobody filled the figures in", () => {
    expect(toSheetCall(call({ outcome: "closed", deal: null })).revenue).toBeNull();
  });

  // A no-show reached its slot and nobody came, which is not the same fact as a
  // meeting called off in advance. The two must never collapse into one flag.
  it("marks a no-show as not showed, and not cancelled", () => {
    const row = toSheetCall(call({ outcome: "no_show" }));
    expect(row.noShow).toBe(true);
    expect(row.showed).toBe(false);
    expect(row.cancelled).toBe(false);
  });

  it("marks a dead appointment status as cancelled", () => {
    const row = toSheetCall(call({ appointmentStatus: "cancelled" }));
    expect(row.cancelled).toBe(true);
    expect(row.showed).toBe(false);
  });

  it("says a follow up needs one", () => {
    expect(toSheetCall(call({ outcome: "follow_up" })).needsFollowUp).toBe(true);
    expect(toSheetCall(call({ outcome: "closed" })).needsFollowUp).toBe(false);
  });

  it("reads the objection through the shared reason list", () => {
    expect(toSheetCall(call({ outcome: "not_interested", reason: "price" })).objection).toBe(
      "Too expensive",
    );
  });

  it("leaves the objection empty on a reason it does not recognise", () => {
    expect(toSheetCall(call({ reason: "made up" })).objection).toBe("");
  });

  it("falls back to the business when the prospect has no name", () => {
    expect(toSheetCall(call({ prospectName: "  " })).name).toBe("Hauck Marketing");
  });

  it("carries the notes taken on the call", () => {
    expect(toSheetCall(call({ scratchpad: "wants to speak to his partner" })).notes).toBe(
      "wants to speak to his partner",
    );
  });
});

describe("callsInMonth", () => {
  // The query window is widened by a day at each end because a New York day
  // reaches into two UTC days. Those extra rows have to be trimmed back here or
  // a neighbouring month's meetings land in this month's totals.
  it("keeps a 9pm New York call in its New York month", () => {
    // 2026-04-01T01:30Z is 2026-03-31 21:30 in New York.
    const rows = [call({ scheduledAt: "2026-04-01T01:30:00Z" })];
    expect(callsInMonth(rows, "America/New_York", "2026-03")).toHaveLength(1);
    expect(callsInMonth(rows, "America/New_York", "2026-04")).toHaveLength(0);
  });

  it("drops the neighbouring month the widened window pulled in", () => {
    const rows = [
      call({ scheduledAt: "2026-02-28T15:00:00Z" }),
      call({ scheduledAt: "2026-03-09T15:30:00Z" }),
      call({ scheduledAt: "2026-04-02T15:00:00Z" }),
    ];
    expect(callsInMonth(rows, "America/New_York", "2026-03")).toHaveLength(1);
  });

  // A meeting the calendar gave no time belongs to no day, so it belongs to no
  // month. It is reported as undated by the endpoint rather than counted here.
  it("drops a meeting with no time on it", () => {
    expect(callsInMonth([call({ scheduledAt: null })], "America/New_York", "2026-03")).toHaveLength(
      0,
    );
  });
});
