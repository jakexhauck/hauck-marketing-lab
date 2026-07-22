import { describe, it, expect } from "vitest";
import {
  slotToInstants,
  formatSlotHeader,
  formatSlotDate,
  minutesToClock,
  hasPickedTime,
  NO_TIME_PICKED,
} from "./setterBooking";

// slotToInstants returns UTC strings, so asserting a literal would only pass
// under one machine timezone. The property that actually matters is that the
// instant reads back as the local wall clock the setter clicked, whatever
// zone the runtime is in, so that is what these assert.
function localParts(iso: string) {
  const d = new Date(iso);
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    h: d.getHours(),
    min: d.getMinutes(),
  };
}

describe("slotToInstants", () => {
  it("reads back as the exact local wall clock that was clicked", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 13 * 60 })!;
    expect(localParts(r.startTime)).toEqual({ y: 2026, m: 7, d: 24, h: 13, min: 0 });
  });

  it("keeps a non-round start minute", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 9 * 60 + 30 })!;
    expect(localParts(r.startTime)).toEqual({ y: 2026, m: 7, d: 24, h: 9, min: 30 });
  });

  it("ends exactly one default duration after it starts", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 13 * 60 })!;
    expect(Date.parse(r.endTime) - Date.parse(r.startTime)).toBe(60 * 60_000);
  });

  it("honours a custom duration", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 13 * 60 }, 90)!;
    expect(Date.parse(r.endTime) - Date.parse(r.startTime)).toBe(90 * 60_000);
    expect(localParts(r.endTime)).toEqual({ y: 2026, m: 7, d: 24, h: 14, min: 30 });
  });

  it("emits real UTC ISO strings, not a naive local literal", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 13 * 60 })!;
    expect(r.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("rolls a late slot into the next calendar day rather than overflowing the hour", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 23 * 60 + 30 })!;
    expect(localParts(r.startTime)).toEqual({ y: 2026, m: 7, d: 24, h: 23, min: 30 });
    expect(localParts(r.endTime)).toEqual({ y: 2026, m: 7, d: 25, h: 0, min: 30 });
  });

  it("crosses a month boundary correctly", () => {
    const r = slotToInstants({ iso: "2026-07-31", startMinutes: 23 * 60 })!;
    expect(localParts(r.endTime)).toEqual({ y: 2026, m: 8, d: 1, h: 0, min: 0 });
  });

  it("crosses a year boundary correctly", () => {
    const r = slotToInstants({ iso: "2026-12-31", startMinutes: 23 * 60 })!;
    expect(localParts(r.endTime)).toEqual({ y: 2027, m: 1, d: 1, h: 0, min: 0 });
  });

  it("handles a leap day", () => {
    const r = slotToInstants({ iso: "2028-02-29", startMinutes: 10 * 60 })!;
    expect(localParts(r.startTime)).toEqual({ y: 2028, m: 2, d: 29, h: 10, min: 0 });
  });

  // Both sides of the US spring-forward and autumn-back transitions. If the
  // implementation ever builds the string from one cached UTC offset instead
  // of a real local Date, one of these drifts by an hour.
  it("survives a DST spring-forward day, both sides of the transition", () => {
    const before = slotToInstants({ iso: "2026-03-08", startMinutes: 1 * 60 })!;
    const after = slotToInstants({ iso: "2026-03-08", startMinutes: 15 * 60 })!;
    expect(localParts(before.startTime).h).toBe(1);
    expect(localParts(after.startTime).h).toBe(15);
  });

  it("survives a DST autumn-back day, both sides of the transition", () => {
    const before = slotToInstants({ iso: "2026-11-01", startMinutes: 1 * 60 })!;
    const after = slotToInstants({ iso: "2026-11-01", startMinutes: 15 * 60 })!;
    expect(localParts(before.startTime).h).toBe(1);
    expect(localParts(after.startTime).h).toBe(15);
  });

  it("midnight is a real slot, not falsy-rejected", () => {
    const r = slotToInstants({ iso: "2026-07-24", startMinutes: 0 })!;
    expect(r).not.toBeNull();
    expect(localParts(r.startTime)).toEqual({ y: 2026, m: 7, d: 24, h: 0, min: 0 });
  });

  it("refuses the no-time-picked sentinel rather than booking something", () => {
    expect(slotToInstants({ iso: "2026-07-24", startMinutes: NO_TIME_PICKED })).toBeNull();
  });

  it("refuses a malformed date", () => {
    expect(slotToInstants({ iso: "24/07/2026", startMinutes: 780 })).toBeNull();
    expect(slotToInstants({ iso: "", startMinutes: 780 })).toBeNull();
    expect(slotToInstants({ iso: "2026-13-01", startMinutes: 780 })).toBeNull();
  });

  it("refuses a non-finite or non-positive duration", () => {
    const slot = { iso: "2026-07-24", startMinutes: 780 };
    expect(slotToInstants(slot, 0)).toBeNull();
    expect(slotToInstants(slot, -30)).toBeNull();
    expect(slotToInstants(slot, Number.NaN)).toBeNull();
  });
});

describe("minutesToClock", () => {
  it("pads to a 24-hour clock", () => {
    expect(minutesToClock(0)).toBe("00:00");
    expect(minutesToClock(9 * 60 + 5)).toBe("09:05");
    expect(minutesToClock(13 * 60)).toBe("13:00");
    expect(minutesToClock(23 * 60 + 59)).toBe("23:59");
  });

  it("wraps past midnight instead of showing a 24th hour", () => {
    expect(minutesToClock(24 * 60)).toBe("00:00");
    expect(minutesToClock(24 * 60 + 45)).toBe("00:45");
  });
});

describe("formatSlotDate", () => {
  it("formats as weekday, day, month", () => {
    expect(formatSlotDate("2026-07-24")).toBe("Fri 24 July");
  });

  it("does not slide a day for a date at either end of the month", () => {
    expect(formatSlotDate("2026-07-01")).toBe("Wed 1 July");
    expect(formatSlotDate("2026-07-31")).toBe("Fri 31 July");
    expect(formatSlotDate("2026-01-01")).toBe("Thu 1 January");
  });

  it("returns an empty string for a malformed date", () => {
    expect(formatSlotDate("nonsense")).toBe("");
  });
});

describe("formatSlotHeader", () => {
  it("reads as the day plus the booked span", () => {
    expect(formatSlotHeader({ iso: "2026-07-24", startMinutes: 13 * 60 })).toBe(
      "Fri 24 July, 13:00 to 14:00",
    );
  });

  it("respects a custom duration", () => {
    expect(formatSlotHeader({ iso: "2026-07-24", startMinutes: 13 * 60 }, 30)).toBe(
      "Fri 24 July, 13:00 to 13:30",
    );
  });

  it("wraps a late slot's end time past midnight", () => {
    expect(formatSlotHeader({ iso: "2026-07-24", startMinutes: 23 * 60 + 30 })).toBe(
      "Fri 24 July, 23:30 to 00:30",
    );
  });

  it("shows the day alone when no time was picked", () => {
    expect(formatSlotHeader({ iso: "2026-07-24", startMinutes: NO_TIME_PICKED })).toBe(
      "Fri 24 July",
    );
  });

  it("returns an empty string for a malformed date", () => {
    expect(formatSlotHeader({ iso: "", startMinutes: 780 })).toBe("");
  });
});

describe("hasPickedTime", () => {
  it("is false for no slot and for the sentinel, true for a real time", () => {
    expect(hasPickedTime(null)).toBe(false);
    expect(hasPickedTime({ iso: "2026-07-24", startMinutes: NO_TIME_PICKED })).toBe(false);
    expect(hasPickedTime({ iso: "2026-07-24", startMinutes: 0 })).toBe(true);
    expect(hasPickedTime({ iso: "2026-07-24", startMinutes: 780 })).toBe(true);
  });
});
