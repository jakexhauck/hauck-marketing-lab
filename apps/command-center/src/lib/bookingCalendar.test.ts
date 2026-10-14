import { describe, expect, it } from "vitest";
import {
  BOOKING_ZONES,
  bookingZoneOptions,
  defaultBookingZone,
  buildBookingWeeks,
  cursorForIso,
  dayKeyInZone,
  firstAvailableIso,
  isKnownZone,
  isoOf,
  regroupDaysInZone,
  timeLabelInZone,
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

// ---------------------------------------------------------------------------
// Reading the same slots on another clock
// ---------------------------------------------------------------------------

describe("timeLabelInZone", () => {
  it("reads one instant differently on each clock", () => {
    const slot = "2026-07-29T14:30:00-04:00";
    expect(timeLabelInZone(slot, "America/New_York")).toBe("2:30 PM");
    expect(timeLabelInZone(slot, "America/Chicago")).toBe("1:30 PM");
    expect(timeLabelInZone(slot, "America/Los_Angeles")).toBe("11:30 AM");
  });
});

describe("dayKeyInZone", () => {
  it("keys a slot to its calendar day on that clock", () => {
    expect(dayKeyInZone("2026-07-29T14:30:00-04:00", "America/New_York")).toBe("2026-07-29");
  });

  // The reason the grouping is rebuilt at all: an early Eastern slot is the
  // PREVIOUS day in Hawaii, so a grid that kept the server's day would file it
  // under a date the caller is not looking at.
  it("moves a slot to the previous day where the clock says so", () => {
    expect(dayKeyInZone("2026-07-29T05:00:00-04:00", "Pacific/Honolulu")).toBe("2026-07-28");
  });
});

describe("regroupDaysInZone", () => {
  const DAYS = [
    {
      date: "2026-07-29",
      slots: ["2026-07-29T05:00:00-04:00", "2026-07-29T14:30:00-04:00"],
    },
  ];

  it("keeps the server's grouping when the clock agrees with it", () => {
    const out = regroupDaysInZone(DAYS, "America/New_York");
    expect(out).toEqual(DAYS);
  });

  it("splits a day whose slots straddle midnight on the chosen clock", () => {
    const out = regroupDaysInZone(DAYS, "Pacific/Honolulu");
    expect(out.map((d) => d.date)).toEqual(["2026-07-28", "2026-07-29"]);
    expect(out[0].slots).toEqual(["2026-07-29T05:00:00-04:00"]);
    expect(out[1].slots).toEqual(["2026-07-29T14:30:00-04:00"]);
  });

  it("hands back the days untouched for a zone this runtime does not know", () => {
    expect(regroupDaysInZone(DAYS, "Mars/Olympus")).toEqual(DAYS);
    expect(regroupDaysInZone(DAYS, "")).toEqual(DAYS);
  });

  it("sorts the times inside each rebuilt day", () => {
    const jumbled = [
      { date: "2026-07-29", slots: ["2026-07-29T16:00:00-04:00"] },
      { date: "2026-07-29", slots: ["2026-07-29T09:00:00-04:00"] },
    ];
    const out = regroupDaysInZone(jumbled, "America/Chicago");
    expect(out).toHaveLength(1);
    expect(out[0].slots).toEqual([
      "2026-07-29T09:00:00-04:00",
      "2026-07-29T16:00:00-04:00",
    ]);
  });
});

describe("isKnownZone", () => {
  it("accepts real IANA zones and refuses anything else", () => {
    expect(isKnownZone("America/Denver")).toBe(true);
    expect(isKnownZone("Mars/Olympus")).toBe(false);
    expect(isKnownZone("")).toBe(false);
  });
});

describe("bookingZoneOptions", () => {
  it("names whose clock each of the two that matter is", () => {
    const opts = bookingZoneOptions("America/New_York", "America/Los_Angeles");
    expect(opts.find((o) => o.zone === "America/New_York")?.label).toBe("Eastern (yours)");
    expect(opts.find((o) => o.zone === "America/Los_Angeles")?.label).toBe("Pacific (theirs)");
    // Everything else reads as the plain list it came from.
    expect(opts.find((o) => o.zone === "America/Chicago")?.label).toBe("Central");
  });

  // Jake works three zones. The picker sets what the prospect is TOLD now, so
  // every extra option is another chance to name the wrong clock in writing.
  it("offers the three zones and nothing else", () => {
    const opts = bookingZoneOptions("America/New_York", null);
    expect(opts.map((o) => o.zone)).toEqual(BOOKING_ZONES);
  });

  // The exception, and the reason it exists: a 208 number is Mountain. Dropping
  // it to keep the list at three would book that prospect under Central and tell
  // them an hour that is not theirs.
  it("still offers a prospect who is outside the three", () => {
    const opts = bookingZoneOptions("America/New_York", "America/Denver");
    expect(opts.map((o) => o.zone)).toContain("America/Denver");
    expect(opts.find((o) => o.zone === "America/Denver")?.label).toBe("Mountain (theirs)");
  });

  it("does not list a prospect twice when they are already in the three", () => {
    const opts = bookingZoneOptions("America/New_York", "America/Los_Angeles");
    expect(opts.filter((o) => o.zone === "America/Los_Angeles")).toHaveLength(1);
  });

  it("says so once when the prospect is on the agency's own clock", () => {
    const opts = bookingZoneOptions("America/New_York", "America/New_York");
    expect(opts.find((o) => o.zone === "America/New_York")?.label).toBe(
      "Eastern (yours and theirs)",
    );
  });

  it("marks nothing as theirs when the prospect's zone is unknown", () => {
    const opts = bookingZoneOptions("America/New_York", null);
    expect(opts.filter((o) => o.label.includes("theirs"))).toHaveLength(0);
  });

  // The default has to be selectable, whatever AGENCY_TIMEZONE holds.
  it("adds an agency zone the list does not carry", () => {
    const opts = bookingZoneOptions("Europe/London", null);
    expect(opts[0]).toEqual({ zone: "Europe/London", label: "Europe/London (yours)" });
  });
});

describe("defaultBookingZone", () => {
  // The bug this fixes: the panel opened on the agency's clock, so a booking
  // made without touching the picker sent Eastern to GoHighLevel for a prospect
  // three timezones away, and the automation named 3pm to somebody whose own
  // clock said 12.
  it("opens on the prospect's clock", () => {
    expect(defaultBookingZone("America/New_York", "America/Los_Angeles")).toBe(
      "America/Los_Angeles",
    );
  });

  it("falls back to the agency's when nothing is known about the prospect", () => {
    expect(defaultBookingZone("America/New_York", null)).toBe("America/New_York");
    expect(defaultBookingZone("America/New_York", "")).toBe("America/New_York");
  });
});
