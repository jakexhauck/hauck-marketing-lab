import { describe, expect, it } from "vitest";
import { summariseOpenHours, toDayHours, toOpenHours } from "./calendarHours";

// The shapes here are the ones GHL actually returned for Willis's Home Estimate
// calendar on 2026-08-13: one entry per weekday, all carrying identical hours.

describe("summariseOpenHours", () => {
  const weekday = (day: number) => ({
    daysOfTheWeek: [day],
    hours: [{ openHour: 11, openMinute: 0, closeHour: 18, closeMinute: 0 }],
  });

  it("collapses five identical weekday entries into one line", () => {
    expect(summariseOpenHours([1, 2, 3, 4, 5].map(weekday))).toEqual([
      "Mon to Fri, 11:00 to 18:00",
    ]);
  });

  it("keeps a gap in the week honest", () => {
    expect(summariseOpenHours([1, 3, 4, 5].map(weekday))).toEqual([
      "Mon, Wed to Fri, 11:00 to 18:00",
    ]);
  });

  it("names two non-consecutive days rather than joining them", () => {
    expect(summariseOpenHours([1, 5].map(weekday))).toEqual(["Mon, Fri, 11:00 to 18:00"]);
  });

  it("splits days that keep different hours", () => {
    expect(
      summariseOpenHours([
        weekday(1),
        {
          daysOfTheWeek: [6],
          hours: [{ openHour: 9, openMinute: 30, closeHour: 12, closeMinute: 0 }],
        },
      ]),
    ).toEqual(["Mon, 11:00 to 18:00", "Sat, 09:30 to 12:00"]);
  });

  it("keeps both halves of a split day", () => {
    expect(
      summariseOpenHours([
        {
          daysOfTheWeek: [2],
          hours: [
            { openHour: 9, openMinute: 0, closeHour: 12, closeMinute: 0 },
            { openHour: 13, openMinute: 0, closeHour: 17, closeMinute: 0 },
          ],
        },
      ]),
    ).toEqual(["Tue, 09:00 to 12:00, 13:00 to 17:00"]);
  });

  it("says nothing at all when a calendar has no hours", () => {
    // A real state in GHL, and not an error: nothing is bookable.
    expect(summariseOpenHours([])).toEqual([]);
    expect(summariseOpenHours(undefined)).toEqual([]);
    expect(summariseOpenHours([{ daysOfTheWeek: [1], hours: [] }])).toEqual([]);
  });
});

describe("toDayHours", () => {
  it("explodes GHL's grouping into one entry per weekday", () => {
    const rows = toDayHours([
      {
        daysOfTheWeek: [1, 2],
        hours: [{ openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 30 }],
      },
    ]);
    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual({ day: 1, ranges: [{ open: "09:00", close: "17:30" }] });
    expect(rows[2].ranges).toEqual([{ open: "09:00", close: "17:30" }]);
    // Every other day comes back closed rather than missing, so the editor has
    // a row to switch on.
    expect(rows[0].ranges).toEqual([]);
  });

  it("keeps both halves of a split day", () => {
    const rows = toDayHours([
      {
        daysOfTheWeek: [3],
        hours: [
          { openHour: 9, openMinute: 0, closeHour: 12, closeMinute: 0 },
          { openHour: 13, openMinute: 0, closeHour: 17, closeMinute: 0 },
        ],
      },
    ]);
    expect(rows[3].ranges).toHaveLength(2);
  });
});

describe("toOpenHours", () => {
  const closed = (day: number) => ({ day, ranges: [] });
  const nine = (day: number) => ({ day, ranges: [{ open: "09:00", close: "17:00" }] });

  it("regroups days that share their times, the way GHL writes them", () => {
    const out = toOpenHours([closed(0), nine(1), nine(2), closed(3), closed(4), closed(5), closed(6)]);
    expect(out).toEqual([
      {
        daysOfTheWeek: [1, 2],
        hours: [{ openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 }],
      },
    ]);
  });

  it("survives a round trip unchanged", () => {
    const original = [
      {
        daysOfTheWeek: [1, 2, 3, 4, 5],
        hours: [{ openHour: 11, openMinute: 0, closeHour: 18, closeMinute: 0 }],
      },
    ];
    expect(toOpenHours(toDayHours(original))).toEqual(original);
  });

  it("writes an empty week rather than failing", () => {
    // A calendar with nothing bookable is a real state, and the operator asked
    // for it. It must not be confused with a malformed payload.
    expect(toOpenHours([closed(0), closed(1)])).toEqual([]);
  });

  it("refuses a close that is not after its open", () => {
    // GHL accepts this silently and the calendar offers nothing, with no error
    // anywhere to explain it.
    expect(toOpenHours([{ day: 1, ranges: [{ open: "17:00", close: "09:00" }] }])).toBeNull();
    expect(toOpenHours([{ day: 1, ranges: [{ open: "09:00", close: "09:00" }] }])).toBeNull();
  });

  it("refuses times that are not times, and days that are not days", () => {
    expect(toOpenHours([{ day: 1, ranges: [{ open: "9am", close: "17:00" }] }])).toBeNull();
    expect(toOpenHours([{ day: 1, ranges: [{ open: "25:00", close: "26:00" }] }])).toBeNull();
    expect(toOpenHours([{ day: 9, ranges: [{ open: "09:00", close: "17:00" }] }])).toBeNull();
  });
});

describe("a calendar GHL never gave hours", () => {
  // Willis's "Window Cleaning Service" comes back with openHours as an empty
  // OBJECT while every other calendar on the same sub-account sends an array.
  // Before this, the Calendars page 500'd for that whole client.
  const empty = {} as never;

  it("reads as closed rather than throwing", () => {
    expect(summariseOpenHours(empty)).toEqual([]);
    expect(toDayHours(empty)).toHaveLength(7);
    expect(toDayHours(empty).every((d) => d.ranges.length === 0)).toBe(true);
  });

  it("survives junk inside the entries too", () => {
    const junk = [{ daysOfTheWeek: {}, hours: {} }] as never;
    expect(summariseOpenHours(junk)).toEqual([]);
    expect(toDayHours(junk).every((d) => d.ranges.length === 0)).toBe(true);
  });

  it("can be given hours from that state", () => {
    const rows = toDayHours(empty);
    rows[1].ranges = [{ open: "09:00", close: "17:00" }];
    expect(toOpenHours(rows)).toEqual([
      { daysOfTheWeek: [1], hours: [{ openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 }] },
    ]);
  });
});
