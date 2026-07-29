import { describe, expect, it } from "vitest";
import {
  callLabel,
  daysInMonth,
  emptyDay,
  rollUpDials,
  rollUpSalesCalls,
  type SalesCallRow,
} from "./salesDataRollup";

// Turning meetings into the Sales Data grid. This is the file that decides what
// a month says about how the agency sells, so the cases below are the ones that
// would otherwise be argued over: an unanswered meeting, a cancellation, a
// late-evening call near a date boundary.

const NY = "America/New_York";

function meeting(over: Partial<SalesCallRow> = {}): SalesCallRow {
  return {
    scheduledAt: "2026-07-15T15:00:00Z",
    appointmentStatus: "confirmed",
    outcome: null,
    qualified: null,
    cashCollected: null,
    prospectName: "Acme Roofing",
    businessName: "",
    ...over,
  };
}

describe("rollUpSalesCalls", () => {
  it("counts a closed meeting as taken, qualified, closed and cash", () => {
    const { days } = rollUpSalesCalls(
      [meeting({ outcome: "closed", qualified: true, cashCollected: 4500 })],
      NY,
    );
    expect(days["2026-07-15"]).toMatchObject({
      onCalendar: 1,
      decided: 1,
      taken: 1,
      qualified: 1,
      closed: 1,
      cash: 4500,
      awaiting: 0,
      cancelled: 0,
    });
  });

  it("counts a no-show as decided but NOT taken", () => {
    // The slot was reached and nobody came. That is the whole reason no_show is
    // an outcome rather than a calendar status.
    const { days } = rollUpSalesCalls([meeting({ outcome: "no_show" })], NY);
    expect(days["2026-07-15"]).toMatchObject({ decided: 1, taken: 0, onCalendar: 1 });
  });

  it("counts a not-qualified as taken but not qualified", () => {
    // They turned up; they were never a prospect. Both facts, separately.
    const { days } = rollUpSalesCalls(
      [meeting({ outcome: "not_qualified", qualified: false })],
      NY,
    );
    expect(days["2026-07-15"]).toMatchObject({ taken: 1, qualified: 0, closed: 0 });
  });

  it("leaves an unrecorded meeting AWAITING, never a no-show", () => {
    // The single most important line here. A meeting nobody has answered for is
    // not a no-show, and counting it as one would quietly invent a show rate.
    const { days } = rollUpSalesCalls([meeting(), meeting({ outcome: "closed" })], NY);
    expect(days["2026-07-15"]).toMatchObject({
      onCalendar: 2,
      awaiting: 1,
      decided: 1,
      taken: 1,
    });
  });

  it("counts a cancelled meeting as cancelled and NOT as awaiting", () => {
    // It was called off. Asking somebody to record an outcome for it would be
    // asking them to invent one.
    const { days } = rollUpSalesCalls([meeting({ appointmentStatus: "cancelled" })], NY);
    expect(days["2026-07-15"]).toMatchObject({
      onCalendar: 1,
      cancelled: 1,
      awaiting: 0,
      decided: 0,
    });
  });

  it("reads GoHighLevel's varied spellings of a dead status", () => {
    const rows = ["canceled", "Cancelled", "no-show", "NoShow", "invalid"].map((s) =>
      meeting({ appointmentStatus: s }),
    );
    expect(rollUpSalesCalls(rows, NY).days["2026-07-15"].cancelled).toBe(5);
  });

  it("reads qualified from the stored flag, not from the outcome", () => {
    // If the two ever disagree the stored fact wins, because the database is
    // what somebody actually recorded.
    const { days } = rollUpSalesCalls(
      [meeting({ outcome: "closed", qualified: false })],
      NY,
    );
    expect(days["2026-07-15"]).toMatchObject({ closed: 1, qualified: 0 });
  });

  it("counts cash wherever it was taken", () => {
    // It should only ever land on a close, but money that came in is money that
    // came in; dropping it because the outcome was odd would be the wrong tidy.
    const { days } = rollUpSalesCalls(
      [meeting({ outcome: "follow_up", cashCollected: 500 })],
      NY,
    );
    expect(days["2026-07-15"].cash).toBe(500);
  });

  it("puts a late-evening meeting on ITS OWN day, not on UTC's tomorrow", () => {
    // 9pm in New York on the 15th is 01:00Z on the 16th. A month whose numbers
    // slide onto the wrong row at each end is a month nobody trusts twice.
    const { days } = rollUpSalesCalls(
      [meeting({ scheduledAt: "2026-07-16T01:00:00Z", outcome: "closed" })],
      NY,
    );
    expect(days["2026-07-15"]?.closed).toBe(1);
    expect(days["2026-07-16"]).toBeUndefined();
  });

  it("groups several days independently", () => {
    const { days } = rollUpSalesCalls(
      [
        meeting({ scheduledAt: "2026-07-15T15:00:00Z", outcome: "closed" }),
        meeting({ scheduledAt: "2026-07-16T15:00:00Z", outcome: "no_show" }),
      ],
      NY,
    );
    expect(days["2026-07-15"].closed).toBe(1);
    expect(days["2026-07-16"].taken).toBe(0);
  });

  it("counts an undated meeting rather than dropping it", () => {
    // A number missing from a month should be visible as a number missing from
    // a month.
    const rolled = rollUpSalesCalls(
      [meeting({ scheduledAt: null }), meeting({ scheduledAt: "nonsense" })],
      NY,
    );
    expect(rolled.undated).toBe(2);
    expect(Object.keys(rolled.days)).toHaveLength(0);
  });

  it("lists the day's meetings by name", () => {
    const { days } = rollUpSalesCalls(
      [meeting({ prospectName: "Acme Roofing" }), meeting({ prospectName: "Baker Co" })],
      NY,
    );
    expect(days["2026-07-15"].names).toEqual(["Acme Roofing", "Baker Co"]);
  });
});

describe("callLabel", () => {
  it("prefers the prospect, falls back to the business, then to Unnamed", () => {
    expect(callLabel(meeting({ prospectName: "Jane", businessName: "Acme" }))).toBe("Jane");
    expect(callLabel(meeting({ prospectName: "  ", businessName: "Acme" }))).toBe("Acme");
    expect(callLabel(meeting({ prospectName: "", businessName: "" }))).toBe("Unnamed");
  });
});

describe("daysInMonth", () => {
  it("trims the widened edges the query had to read", () => {
    // The database is read on a UTC window a day wider at each end, because a
    // New York day reaches into two UTC days. The edges come off here.
    const days = {
      "2026-06-30": emptyDay(),
      "2026-07-01": emptyDay(),
      "2026-07-31": emptyDay(),
      "2026-08-01": emptyDay(),
    };
    expect(Object.keys(daysInMonth(days, "2026-07")).sort()).toEqual([
      "2026-07-01",
      "2026-07-31",
    ]);
  });

  it("does not let a month swallow one whose name starts the same way", () => {
    // "2026-1" must not match "2026-10-05". The dash in the prefix is what
    // prevents it, so it is worth a test of its own.
    expect(Object.keys(daysInMonth({ "2026-10-05": emptyDay() }, "2026-1"))).toHaveLength(0);
  });
});

describe("rollUpDials", () => {
  const dial = (over: Partial<{ spoke: boolean; pitched: boolean; outcome: string }> = {}) => ({
    spoke: false,
    pitched: false,
    outcome: "no_answer",
    ...over,
  });

  it("counts every attempt as a dial", () => {
    expect(rollUpDials([dial(), dial(), dial()]).dials).toBe(3);
  });

  it("reads spoke and pitched off the ROW, not off the outcome", () => {
    // The stored booleans are what the app measured at the time. Re-deriving
    // them from the outcome here would let this page and the Cold Call tracker
    // disagree about what a pickup is.
    const totals = rollUpDials([
      dial({ spoke: true, pitched: true, outcome: "booked" }),
      dial({ spoke: true, pitched: false, outcome: "brush_off" }),
      dial(),
    ]);
    expect(totals.talked).toBe(2);
    expect(totals.pitched).toBe(1);
    expect(totals.booked).toBe(1);
  });

  it("tolerates the nulls a database column can hold", () => {
    const totals = rollUpDials([{ spoke: null, pitched: null, outcome: null }]);
    expect(totals).toEqual({ dials: 1, talked: 0, pitched: 0, booked: 0 });
  });

  it("has an all-zero month rather than a missing one", () => {
    expect(rollUpDials([])).toEqual({ dials: 0, talked: 0, pitched: 0, booked: 0 });
  });
});
