import { describe, expect, it } from "vitest";
import {
  buildBookingWeeks,
  cursorForIso,
  firstAvailableIso,
  isoOf,
} from "./bookingCalendar";
import type { TodayRef } from "./trackerMonth";

// July 2026 starts on a Wednesday and has 31 days, so it exercises both a
// ragged first week and a ragged last one.
const JULY = { year: 2026, month: 6 };
const TODAY: TodayRef = { year: 2026, month: 6, day: 26 };

describe("buildBookingWeeks", () => {
  it("lays the month out in weeks that always start on Sunday", () => {
    const weeks = buildBookingWeeks(JULY, TODAY, new Set());
    expect(weeks[0]).toHaveLength(7);
    // Jul 1 2026 is a Wednesday, so the first three cells are padding.
    expect(weeks[0].slice(0, 3).every((c) => c.iso === null)).toBe(true);
    expect(weeks[0][3]?.day).toBe(1);
  });

  it("covers every day of the month exactly once", () => {
    const days = buildBookingWeeks(JULY, TODAY, new Set())
      .flat()
      .filter((c) => c.iso !== null)
      .map((c) => c.day);
    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
    expect(days[0]).toBe(1);
    expect(days[30]).toBe(31);
  });

  it("pads the last week so every row is seven cells", () => {
    for (const week of buildBookingWeeks(JULY, TODAY, new Set())) {
      expect(week).toHaveLength(7);
    }
  });

  it("marks the days the calendar offered times for", () => {
    const weeks = buildBookingWeeks(JULY, TODAY, new Set(["2026-07-29"]));
    const cells = weeks.flat().filter((c) => c.iso !== null);
    expect(cells.find((c) => c.day === 29)?.hasSlots).toBe(true);
    expect(cells.find((c) => c.day === 28)?.hasSlots).toBe(false);
  });

  it("marks today, and everything before it as past", () => {
    const cells = buildBookingWeeks(JULY, TODAY, new Set())
      .flat()
      .filter((c) => c.iso !== null);
    expect(cells.find((c) => c.day === 26)?.isToday).toBe(true);
    expect(cells.find((c) => c.day === 25)?.isPast).toBe(true);
    // Today is not past: a slot later today is still bookable.
    expect(cells.find((c) => c.day === 26)?.isPast).toBe(false);
    expect(cells.find((c) => c.day === 27)?.isPast).toBe(false);
  });

  it("treats a whole earlier month as past", () => {
    const cells = buildBookingWeeks({ year: 2026, month: 5 }, TODAY, new Set())
      .flat()
      .filter((c) => c.iso !== null);
    expect(cells.every((c) => c.isPast)).toBe(true);
  });

  it("treats a whole later month as not past", () => {
    const cells = buildBookingWeeks({ year: 2026, month: 7 }, TODAY, new Set())
      .flat()
      .filter((c) => c.iso !== null);
    expect(cells.some((c) => c.isPast)).toBe(false);
  });
});

describe("isoOf", () => {
  it("zero-pads month and day", () => {
    expect(isoOf(2026, 0, 5)).toBe("2026-01-05");
    expect(isoOf(2026, 11, 31)).toBe("2026-12-31");
  });
});

describe("cursorForIso", () => {
  it("opens the month a date belongs to", () => {
    expect(cursorForIso("2026-09-14")).toEqual({ year: 2026, month: 8 });
  });

  it("returns null for junk rather than a wrong month", () => {
    expect(cursorForIso("")).toBeNull();
    expect(cursorForIso("not-a-date")).toBeNull();
  });
});

describe("firstAvailableIso", () => {
  it("finds the first day that actually has times", () => {
    const days = [
      { date: "2026-07-27", slots: [] },
      { date: "2026-07-29", slots: ["2026-07-29T13:00:00-04:00"] },
      { date: "2026-07-30", slots: ["2026-07-30T13:00:00-04:00"] },
    ];
    expect(firstAvailableIso(days)).toBe("2026-07-29");
  });

  it("returns null when the calendar is fully booked", () => {
    expect(firstAvailableIso([{ date: "2026-07-27", slots: [] }])).toBeNull();
    expect(firstAvailableIso([])).toBeNull();
  });
});
