import { describe, expect, it } from "vitest";
import {
  MEETINGS_FROM_CALENDAR,
  addCalendarMeetings,
  creditMeetings,
  type CalendarMeetingRow,
} from "./coldCallMeetings";
import { rollUpDialsByDay } from "./coldCallDials";
import { aggregateAgencyMonth } from "./coldCallAgency";

const ZONE = "America/Detroit";

function meeting(over: Partial<CalendarMeetingRow> = {}): CalendarMeetingRow {
  return {
    createdAt: "2026-10-02T15:00:00Z",
    calendarName: "Hauck Marketing Demo Call - Cold Call",
    excludedAt: null,
    loggedBy: null,
    leadId: "lead-1",
    ...over,
  };
}

describe("creditMeetings", () => {
  it("credits a meeting to the day it was booked, in the agency's zone", () => {
    // 02:00 UTC on the 3rd is still the 2nd in Detroit.
    const out = creditMeetings([meeting({ createdAt: "2026-10-03T02:00:00Z", loggedBy: "jake" })], new Map(), ZONE);
    expect(out).toEqual([{ callerId: "jake", day: "2026-10-02" }]);
  });

  it("only counts the cold call calendar", () => {
    const out = creditMeetings([meeting({ calendarName: "Hauck Marketing Demo Call", loggedBy: "jake" })], new Map(), ZONE);
    expect(out).toEqual([]);
  });

  it("skips excluded rows and anything booked before the cutoff", () => {
    const out = creditMeetings(
      [
        meeting({ excludedAt: "2026-10-02T00:00:00Z", loggedBy: "jake" }),
        meeting({ createdAt: "2026-09-30T15:00:00Z", loggedBy: "jake" }),
      ],
      new Map(),
      ZONE,
    );
    expect(out).toEqual([]);
  });

  it("credits a calendar booking to whoever last dialled the prospect", () => {
    const out = creditMeetings([meeting({ leadId: "lead-1" })], new Map([["lead-1", "ben"]]), ZONE);
    expect(out).toEqual([{ callerId: "ben", day: "2026-10-02" }]);
  });

  it("prefers the last caller, then who logged it", () => {
    const last = new Map([["lead-1", "ben"]]);
    expect(creditMeetings([meeting({ loggedBy: "zed" })], last, ZONE)[0].callerId).toBe("ben");
    expect(creditMeetings([meeting({ loggedBy: "zed", leadId: null })], last, ZONE)[0].callerId).toBe("zed");
    expect(creditMeetings([meeting({ leadId: null })], last, ZONE)[0].callerId).toBe("");
  });
});

describe("addCalendarMeetings", () => {
  it("adds to a dialled day and stands up a day with only a meeting", () => {
    const recorded = rollUpDialsByDay([{ day: "2026-10-02", spoke: true, pitched: true, outcome: "pitch_no" }]);
    const out = addCalendarMeetings(recorded, ["2026-10-02", "2026-10-02", "2026-10-04"]);
    expect(out["2026-10-02"].meetingsBooked).toBe(2);
    expect(out["2026-10-02"].callsMade).toBe(1);
    expect(out["2026-10-04"]).toEqual({ callsMade: 0, pickups: 0, passThrough: 0, meetingsBooked: 1, reasons: {} });
  });
});

describe("booked dials from the cutoff", () => {
  it("still count as a pitched pickup but not as a meeting", () => {
    const out = rollUpDialsByDay([
      { day: MEETINGS_FROM_CALENDAR, spoke: true, pitched: true, outcome: "booked" },
      { day: "2026-09-30", spoke: true, pitched: true, outcome: "booked" },
    ]);
    expect(out[MEETINGS_FROM_CALENDAR]).toMatchObject({ callsMade: 1, pickups: 1, passThrough: 1, meetingsBooked: 0 });
    expect(out["2026-09-30"].meetingsBooked).toBe(1);
  });
});

describe("aggregateAgencyMonth with calendar meetings", () => {
  it("adds each caller's meetings into the agency total", () => {
    const month = aggregateAgencyMonth(
      [],
      [{ callerId: "jake", day: "2026-10-02", spoke: false, pitched: false, outcome: "no_answer" }],
      [
        { callerId: "jake", day: "2026-10-02" },
        { callerId: "ben", day: "2026-10-03" },
      ],
    );
    expect(month.days.map((d) => [d.day, d.recorded?.meetingsBooked, d.recorded?.callsMade])).toEqual([
      ["2026-10-02", 1, 1],
      ["2026-10-03", 1, 0],
    ]);
  });
});
