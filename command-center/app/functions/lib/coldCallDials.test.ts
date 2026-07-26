import { describe, it, expect } from "vitest";
import {
  DIAL_OUTCOMES,
  formatObjections,
  isDialOutcome,
  mergeRecordedDays,
  rollUpDialsByDay,
  type DialRow,
  type TypedDay,
} from "./coldCallDials";

function dial(over: Partial<DialRow> = {}): DialRow {
  return { day: "2026-07-26", spoke: false, pitched: false, outcome: "no_answer", ...over };
}

function typedDay(over: Partial<TypedDay> = {}): TypedDay {
  return {
    id: "row-1",
    day: "2026-07-26",
    callsMade: null,
    pickups: null,
    passThrough: null,
    meetingsBooked: null,
    objections: null,
    notes: null,
    ...over,
  };
}

describe("the five outcomes", () => {
  it("pairs each outcome with what it counts as", () => {
    expect(DIAL_OUTCOMES.no_answer).toEqual({ spoke: false, pitched: false });
    expect(DIAL_OUTCOMES.brush_off).toEqual({ spoke: true, pitched: false });
    expect(DIAL_OUTCOMES.not_interested).toEqual({ spoke: true, pitched: true });
    expect(DIAL_OUTCOMES.callback).toEqual({ spoke: true, pitched: true });
    expect(DIAL_OUTCOMES.booked).toEqual({ spoke: true, pitched: true });
  });

  it("rejects anything else", () => {
    expect(isDialOutcome("booked")).toBe(true);
    expect(isDialOutcome("voicemail")).toBe(false);
    expect(isDialOutcome(undefined)).toBe(false);
  });
});

describe("rollUpDialsByDay", () => {
  it("counts a dial, a pickup, a pass-through and a booking", () => {
    const counts = rollUpDialsByDay([
      dial(),
      dial({ spoke: true, outcome: "brush_off" }),
      dial({ spoke: true, pitched: true, outcome: "not_interested" }),
      dial({ spoke: true, pitched: true, outcome: "booked" }),
    ]);
    expect(counts["2026-07-26"]).toEqual({
      callsMade: 4,
      pickups: 3,
      passThrough: 2,
      meetingsBooked: 1, reasons: {},
    });
  });

  it("keeps days apart", () => {
    const counts = rollUpDialsByDay([dial(), dial({ day: "2026-07-27" })]);
    expect(counts["2026-07-26"].callsMade).toBe(1);
    expect(counts["2026-07-27"].callsMade).toBe(1);
  });

  it("reads a timestamp-shaped day as its date", () => {
    const counts = rollUpDialsByDay([dial({ day: "2026-07-26T00:00:00+00:00" })]);
    expect(counts["2026-07-26"].callsMade).toBe(1);
  });

  it("trusts the stored booleans over the outcome name", () => {
    // A row that says booked but was never marked as spoken to still counts the
    // booking; the DB row is the fact.
    const counts = rollUpDialsByDay([dial({ outcome: "booked" })]);
    expect(counts["2026-07-26"]).toEqual({
      callsMade: 1,
      pickups: 0,
      passThrough: 0,
      meetingsBooked: 1, reasons: {},
    });
  });

  it("ignores a row with no day rather than inventing one", () => {
    expect(rollUpDialsByDay([dial({ day: "" })])).toEqual({});
  });

  it("returns nothing for no dials, never a zero-filled day", () => {
    expect(rollUpDialsByDay([])).toEqual({});
  });
});

describe("mergeRecordedDays", () => {
  const counts = { callsMade: 9, pickups: 2, passThrough: 1, meetingsBooked: 0, reasons: {} };

  it("attaches the recorded counts to a typed day", () => {
    const [row] = mergeRecordedDays([typedDay({ callsMade: 40 })], {
      "2026-07-26": counts,
    });
    expect(row.callsMade).toBe(40);
    expect(row.recorded).toEqual(counts);
  });

  it("leaves a typed day with no dials recorded as null", () => {
    const [row] = mergeRecordedDays([typedDay({ notes: "off-app day" })], {});
    expect(row.recorded).toBeNull();
  });

  it("stands up a row for a day that was dialled but never typed into", () => {
    const rows = mergeRecordedDays([], { "2026-07-26": counts });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("recorded:2026-07-26");
    expect(rows[0].callsMade).toBeNull();
    expect(rows[0].recorded).toEqual(counts);
  });

  it("never duplicates a day that exists on both sides", () => {
    const rows = mergeRecordedDays([typedDay()], { "2026-07-26": counts });
    expect(rows).toHaveLength(1);
  });

  it("returns the month in day order", () => {
    const rows = mergeRecordedDays([typedDay({ day: "2026-07-28" })], {
      "2026-07-26": counts,
      "2026-07-27": counts,
    });
    expect(rows.map((r) => r.day)).toEqual(["2026-07-26", "2026-07-27", "2026-07-28"]);
  });
});


describe("reasons on the rollup", () => {
  it("tallies why the day's nos were nos", () => {
    const counts = rollUpDialsByDay([
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "not_interested", reason: "has_agency" },
      { day: "2026-07-26", spoke: true, pitched: false, outcome: "brush_off", reason: "no_engage" },
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "not_interested", reason: "has_agency" },
      { day: "2026-07-26", spoke: false, pitched: false, outcome: "no_answer", reason: null },
    ]);
    expect(counts["2026-07-26"].reasons).toEqual({ has_agency: 2, no_engage: 1 });
    // A no-answer is still a call, and still not an objection.
    expect(counts["2026-07-26"].callsMade).toBe(4);
  });
});

describe("formatObjections", () => {
  it("writes the day's objections commonest first", () => {
    expect(formatObjections({ no_engage: 1, has_agency: 3 })).toBe(
      "3 already has an agency, 1 would not engage",
    );
  });

  it("is blank when nothing was recorded", () => {
    expect(formatObjections({})).toBe("");
    expect(formatObjections(null)).toBe("");
  });

  it("ignores a reason it does not know rather than printing a raw key", () => {
    expect(formatObjections({ made_up: 4, bad_fit: 1 })).toBe("1 not a fit");
  });

  it("breaks ties in the order the reasons are declared, so the text is stable", () => {
    expect(formatObjections({ bad_fit: 1, pitched_no: 1 })).toBe(
      "1 heard the pitch, said no, 1 not a fit",
    );
  });
});
