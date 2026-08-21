import { describe, it, expect } from "vitest";
import {
  DIAL_OUTCOMES,
  formatObjections,
  countsAsDial,
  isDialOutcome,
  NO_OUTCOMES,
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

describe("the six outcomes", () => {
  it("pairs each outcome with what it counts as", () => {
    const counts = (o: keyof typeof DIAL_OUTCOMES) => ({
      spoke: DIAL_OUTCOMES[o].spoke,
      pitched: DIAL_OUTCOMES[o].pitched,
    });
    expect(counts("no_answer")).toEqual({ spoke: false, pitched: false });
    expect(counts("not_qualified")).toEqual({ spoke: true, pitched: false });
    expect(counts("opener_no")).toEqual({ spoke: true, pitched: false });
    expect(counts("pitch_no")).toEqual({ spoke: true, pitched: true });
    expect(counts("callback")).toEqual({ spoke: true, pitched: true });
    expect(counts("booked")).toEqual({ spoke: true, pitched: true });
  });

  it("counts only the no that actually reached the pitch as a pass-through", () => {
    // The whole reason these are three outcomes rather than one. Pass-through
    // measures whether the script survives contact, so grouping "would not
    // engage" with "heard it all and declined" inflates the only number that
    // says whether the pitch works.
    expect(DIAL_OUTCOMES.not_qualified.pitched).toBe(false);
    expect(DIAL_OUTCOMES.opener_no.pitched).toBe(false);
    expect(DIAL_OUTCOMES.pitch_no.pitched).toBe(true);
  });

  it("counts every no as a pickup, because somebody answered", () => {
    for (const o of NO_OUTCOMES) expect(DIAL_OUTCOMES[o].spoke).toBe(true);
  });

  it("rejects anything else, including the retired outcomes", () => {
    expect(isDialOutcome("booked")).toBe(true);
    expect(isDialOutcome("voicemail")).toBe(false);
    expect(isDialOutcome(undefined)).toBe(false);
    // 0078 replaced these. A stale client sending one must be refused, not
    // written under a name the CHECK constraint no longer allows.
    expect(isDialOutcome("brush_off")).toBe(false);
    expect(isDialOutcome("not_interested")).toBe(false);
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

  // 0117. A wrong-trade business was never a prospect, so the call measures the
  // list, not the day: it is not a call made, not a pickup, not a pass-through.
  it("leaves a wrong-trade call out of the day entirely", () => {
    const counts = rollUpDialsByDay([dial(), dial({ outcome: "not_in_niche" })]);
    expect(counts["2026-07-26"].callsMade).toBe(1);
  });

  it("does not stand a day up for wrong-trade calls alone", () => {
    expect(rollUpDialsByDay([dial({ outcome: "not_in_niche" })])).toEqual({});
  });

  // The outcome it was being confused with. Unchanged on purpose.
  it("still counts a not_qualified call as a call made", () => {
    const counts = rollUpDialsByDay([dial({ outcome: "not_qualified", spoke: true })]);
    expect(counts["2026-07-26"].callsMade).toBe(1);
    expect(counts["2026-07-26"].pickups).toBe(1);
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


describe("nos on the rollup", () => {
  it("tallies how far each of the day's nos got", () => {
    const counts = rollUpDialsByDay([
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "pitch_no" },
      { day: "2026-07-26", spoke: true, pitched: false, outcome: "opener_no" },
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "pitch_no" },
      { day: "2026-07-26", spoke: false, pitched: false, outcome: "no_answer" },
    ]);
    expect(counts["2026-07-26"].reasons).toEqual({ pitch_no: 2, opener_no: 1 });
    // A no-answer is still a call, and still not an objection.
    expect(counts["2026-07-26"].callsMade).toBe(4);
    // And the pass-through split survives the rollup: two of the three answered
    // calls reached the pitch.
    expect(counts["2026-07-26"].pickups).toBe(3);
    expect(counts["2026-07-26"].passThrough).toBe(2);
  });

  it("does not tally a booking or a callback as a no", () => {
    const counts = rollUpDialsByDay([
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "booked" },
      { day: "2026-07-26", spoke: true, pitched: true, outcome: "callback" },
    ]);
    expect(counts["2026-07-26"].reasons).toEqual({});
    expect(counts["2026-07-26"].meetingsBooked).toBe(1);
  });
});

describe("formatObjections", () => {
  it("writes the day's objections commonest first", () => {
    expect(formatObjections({ opener_no: 1, pitch_no: 3 })).toBe(
      "3 heard pitch, said no, 1 heard opener, said no",
    );
  });

  it("is blank when nothing was recorded", () => {
    expect(formatObjections({})).toBe("");
    expect(formatObjections(null)).toBe("");
  });

  it("ignores an outcome it does not know rather than printing a raw key", () => {
    expect(formatObjections({ made_up: 4, not_qualified: 1 })).toBe("1 not qualified");
  });

  it("counts only the nos, never a booking or a callback", () => {
    // These arrive in the same counts object; a day that booked four meetings
    // must not report "4 booked" in the Objections column.
    expect(formatObjections({ booked: 4, callback: 2, opener_no: 1 })).toBe(
      "1 heard opener, said no",
    );
  });

  it("breaks ties in the order the outcomes are declared, so the text is stable", () => {
    expect(formatObjections({ pitch_no: 1, not_qualified: 1 })).toBe(
      "1 not qualified, 1 heard pitch, said no",
    );
  });
});

describe("countsAsDial", () => {
  it("counts every outcome but the wrong-trade one", () => {
    for (const key of Object.keys(DIAL_OUTCOMES)) {
      expect(countsAsDial(key)).toBe(key !== "not_in_niche");
    }
  });

  // A call the phone system reported that nobody has judged yet. It provably
  // happened, so it counts; "pending" is not in DIAL_OUTCOMES by design.
  it("counts a pending call", () => {
    expect(countsAsDial("pending")).toBe(true);
  });

  // The safe direction. A row nobody can explain still represents a call
  // somebody made, and dropping it would quietly shrink the day.
  it("counts a row whose outcome it does not recognise", () => {
    expect(countsAsDial("something_new")).toBe(true);
    expect(countsAsDial(null)).toBe(true);
  });
});
