import { describe, expect, it } from "vitest";
import {
  callLabel,
  daysInMonth,
  emptyDay,
  rollUpSalesCalls,
  rowsInMonth,
  toCountable,
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

describe("what the closes are worth every month", () => {
  it("adds the retainer to the day it closed on, apart from the cash", () => {
    const { days } = rollUpSalesCalls(
      [
        meeting({
          outcome: "closed",
          cashCollected: 500,
          deal: { monthly: 2000, months: 12 },
        }),
      ],
      NY,
    );
    expect(days["2026-07-15"]).toMatchObject({ closed: 1, cash: 500, mrr: 2000 });
  });

  it("leaves a close with no retainer filled in at zero rather than guessing", () => {
    const { days } = rollUpSalesCalls([meeting({ outcome: "closed", cashCollected: 500 })], NY);
    expect(days["2026-07-15"].mrr).toBe(0);
  });

  it("ignores a retainer sitting on a meeting that did not sell", () => {
    const { days } = rollUpSalesCalls(
      [meeting({ outcome: "not_interested", deal: { monthly: 9000, months: 12 } })],
      NY,
    );
    expect(days["2026-07-15"].mrr).toBe(0);
  });

  it("starts every day at no MRR", () => {
    expect(emptyDay().mrr).toBe(0);
  });
});

describe("rowsInMonth", () => {
  // The query window is widened a day at each end, so without this trim a
  // meeting from the 31st of last month would put its objection in this month's
  // list.
  it("keeps only the meetings whose local day is in the month", () => {
    const rows = [
      meeting({ scheduledAt: "2026-06-30T20:00:00Z" }),
      meeting({ scheduledAt: "2026-07-15T15:00:00Z" }),
      meeting({ scheduledAt: "2026-08-01T15:00:00Z" }),
    ];
    expect(rowsInMonth(rows, NY, "2026-07")).toHaveLength(1);
  });

  it("uses the agency's day, not UTC, at the boundary", () => {
    // 1am UTC on 1 August is still 9pm on 31 July in New York, so this meeting
    // belongs to July and its objection is July's.
    const late = meeting({ scheduledAt: "2026-08-01T01:00:00Z" });
    expect(rowsInMonth([late], NY, "2026-07")).toHaveLength(1);
    expect(rowsInMonth([late], "UTC", "2026-07")).toHaveLength(0);
  });

  it("drops a meeting with no time on it, which belongs to no month", () => {
    expect(rowsInMonth([meeting({ scheduledAt: null })], NY, "2026-07")).toEqual([]);
  });
});

describe("toCountable", () => {
  it("hands the shared counting rules a parsed deal, the source and the offer", () => {
    const c = toCountable(
      meeting({
        outcome: "closed",
        cashCollected: 250,
        deal: { monthly: 1000 },
        source: "Calendar",
        reason: null,
        offerVariant: "retainer_no_guarantee",
      }),
    );
    expect(c).toEqual({
      scheduledAt: "2026-07-15T15:00:00Z",
      outcome: "closed",
      cashCollected: 250,
      deal: { monthly: 1000, months: null },
      reason: null,
      source: "Calendar",
      offerVariant: "retainer_no_guarantee",
    });
  });

  it("passes a missing offer through as null rather than dropping the key", () => {
    // Every meeting recorded before 0086 has no offer on it, and byOffer has to
    // see a null to skip it rather than an absent property to guess at.
    expect(toCountable(meeting({ outcome: "closed" })).offerVariant).toBeNull();
  });

  it("refuses an outcome the app does not recognise rather than passing it on", () => {
    // A value the CHECK constraint would not accept must not reach the counting
    // as if it were an outcome.
    expect(toCountable(meeting({ outcome: "showed_up" })).outcome).toBeNull();
  });
});
