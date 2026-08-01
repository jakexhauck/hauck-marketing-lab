import { describe, it, expect } from "vitest";
import {
  aggregateAgencyMonth,
  type AgencyDialRow,
  type AgencyTypedRow,
} from "./coldCallAgency";

function dial(over: Partial<AgencyDialRow> = {}): AgencyDialRow {
  return {
    callerId: "ann",
    day: "2026-07-27",
    spoke: false,
    pitched: false,
    outcome: "no_answer",
    ...over,
  };
}

function typed(over: Partial<AgencyTypedRow> = {}): AgencyTypedRow {
  return {
    callerId: "ann",
    id: "row-1",
    day: "2026-07-27",
    callsMade: null,
    pickups: null,
    passThrough: null,
    meetingsBooked: null,
    objections: null,
    notes: null,
    ...over,
  };
}

// A booked dial: spoke, pitched and booked, which is what the call card writes.
function booked(over: Partial<AgencyDialRow> = {}): AgencyDialRow {
  return dial({ spoke: true, pitched: true, outcome: "booked", ...over });
}

describe("summing the callers", () => {
  it("adds two people's day into one row", () => {
    const month = aggregateAgencyMonth([], [
      dial(),
      dial(),
      booked({ callerId: "ben" }),
      dial({ callerId: "ben", spoke: true, outcome: "opener_no" }),
    ]);

    expect(month.days).toHaveLength(1);
    expect(month.days[0].recorded).toMatchObject({
      callsMade: 4,
      pickups: 2,
      passThrough: 1,
      meetingsBooked: 1,
    });
    expect(month.callers).toBe(2);
  });

  it("keeps each day separate and returns them in order", () => {
    const month = aggregateAgencyMonth([], [
      dial({ day: "2026-07-29" }),
      dial({ day: "2026-07-27" }),
      dial({ day: "2026-07-27", callerId: "ben" }),
    ]);

    expect(month.days.map((d) => d.day)).toEqual(["2026-07-27", "2026-07-29"]);
    expect(month.days[0].recorded?.callsMade).toBe(2);
    expect(month.days[1].recorded?.callsMade).toBe(1);
  });

  it("leaves a day nobody worked out of the month entirely", () => {
    const month = aggregateAgencyMonth([], [dial({ day: "2026-07-27" })]);
    expect(month.days.map((d) => d.day)).toEqual(["2026-07-27"]);
  });

  it("counts nothing as nothing", () => {
    const month = aggregateAgencyMonth([], []);
    expect(month).toEqual({ days: [], callers: 0, typedDays: 0 });
  });
});

describe("typed cells, resolved per caller before the sum", () => {
  it("replaces only the typing caller's own count", () => {
    // Ann dialled 2 in the app but says she made 40 (the rest off-app). Ben's 3
    // are untouched, so the agency sees 43 and not 45 or 5.
    const month = aggregateAgencyMonth(
      [typed({ callerId: "ann", callsMade: 40 })],
      [dial(), dial(), dial({ callerId: "ben" }), dial({ callerId: "ben" }), dial({ callerId: "ben" })],
    );

    expect(month.days[0].recorded?.callsMade).toBe(43);
  });

  it("takes a typed count from a caller the app recorded nothing for", () => {
    const month = aggregateAgencyMonth(
      [typed({ callerId: "cara", callsMade: 60, meetingsBooked: 2 })],
      [dial({ callerId: "ann" })],
    );

    expect(month.days[0].recorded).toMatchObject({ callsMade: 61, meetingsBooked: 2 });
    expect(month.callers).toBe(2);
  });

  it("resolves each column on its own", () => {
    // Pickups typed, dials not: the dials stay measured.
    const month = aggregateAgencyMonth(
      [typed({ pickups: 9 })],
      [dial(), dial({ spoke: true, outcome: "opener_no" })],
    );

    expect(month.days[0].recorded).toMatchObject({ callsMade: 2, pickups: 9 });
  });

  it("reports which days carry hand-typed counts", () => {
    const month = aggregateAgencyMonth(
      [
        typed({ day: "2026-07-27", callsMade: 40 }),
        typed({ day: "2026-07-27", callerId: "ben", callsMade: 30 }),
        typed({ day: "2026-07-28", id: "row-2", notes: "off sick" }),
      ],
      [dial({ day: "2026-07-28" })],
    );

    // Two callers typed into the 27th: one day, not two cells.
    expect(month.typedDays).toBe(1);
    // A row holding only a note is not a typed count and does not make a day.
    expect(month.days.map((d) => d.day)).toEqual(["2026-07-27", "2026-07-28"]);
  });

  it("never stands a day up from a row with nothing on it", () => {
    const month = aggregateAgencyMonth([typed({ notes: "quiet" })], []);
    expect(month.days).toEqual([]);
    expect(month.callers).toBe(0);
  });

  it("does not carry one caller's typed prose onto the agency row", () => {
    const month = aggregateAgencyMonth(
      [typed({ callsMade: 40, objections: "everyone hung up", notes: "long day" })],
      [],
    );

    expect(month.days[0].objections).toBeNull();
    expect(month.days[0].notes).toBeNull();
  });

  it("hands the client an aggregate with no typed cells on it", () => {
    // The four typed fields stay null so the grid marks nothing as hand-typed:
    // "typed" is a fact about one caller's cell, not about a sum of five.
    const month = aggregateAgencyMonth([typed({ callsMade: 40 })], [dial()]);
    const row = month.days[0];

    expect(row.callsMade).toBeNull();
    expect(row.pickups).toBeNull();
    expect(row.passThrough).toBeNull();
    expect(row.meetingsBooked).toBeNull();
    expect(row.id).toBe("agency:2026-07-27");
  });
});

describe("why they said no, across the roster", () => {
  it("merges the no counts", () => {
    const month = aggregateAgencyMonth([], [
      dial({ spoke: true, pitched: true, outcome: "pitch_no" }),
      dial({ spoke: true, pitched: true, outcome: "pitch_no" }),
      dial({ callerId: "ben", spoke: true, outcome: "opener_no" }),
      dial({ callerId: "ben", spoke: true, pitched: true, outcome: "pitch_no" }),
    ]);

    // Keyed by outcome since 0078: the outcome carries how far the call got, so
    // the separate reason list it used to read is gone.
    expect(month.days[0].recorded?.reasons).toEqual({ pitch_no: 3, opener_no: 1 });
  });

  it("keeps a caller with no id out of nobody's column", () => {
    // A dial whose caller has since been deleted still counts for the agency.
    const month = aggregateAgencyMonth([], [dial({ callerId: "" }), dial({ callerId: "ann" })]);
    expect(month.days[0].recorded?.callsMade).toBe(2);
    expect(month.callers).toBe(2);
  });
});
