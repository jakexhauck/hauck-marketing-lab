import { describe, it, expect } from "vitest";
import {
  CALLBACK_TIMES,
  buildCallbackTimes,
  describeCallback,
  formatTime,
  normalizeTime,
  parseTime,
} from "./callbackTimes";

describe("buildCallbackTimes", () => {
  it("runs half-hourly from 8am to the last slot before 8pm", () => {
    const times = buildCallbackTimes();
    expect(times[0]).toBe("08:00");
    expect(times[1]).toBe("08:30");
    expect(times[times.length - 1]).toBe("19:30");
    expect(times).toHaveLength(24);
  });

  it("pads every hour to two digits, so the strings sort", () => {
    expect(CALLBACK_TIMES.every((t) => /^\d{2}:(00|30)$/.test(t))).toBe(true);
    expect([...CALLBACK_TIMES].sort()).toEqual(CALLBACK_TIMES);
  });
});

describe("parseTime", () => {
  it("reads the picker's own format", () => {
    expect(parseTime("14:30")).toEqual({ hour: 14, minute: 30 });
  });

  // A `time` column comes back with seconds attached.
  it("reads what Postgres returns", () => {
    expect(parseTime("14:30:00")).toEqual({ hour: 14, minute: 30 });
  });

  it("returns null rather than a broken time", () => {
    for (const bad of [null, undefined, "", "half two", "25:00", "12:99", "abc"]) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe("formatTime", () => {
  it("reads the way somebody would say it", () => {
    expect(formatTime("14:30")).toBe("2:30 pm");
    expect(formatTime("09:00")).toBe("9:00 am");
  });

  // The two that catch every naive 12-hour conversion.
  it("gets midnight and midday right", () => {
    expect(formatTime("00:15")).toBe("12:15 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
  });

  it("is empty when there is no time", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime("nonsense")).toBe("");
  });
});

describe("normalizeTime", () => {
  it("reduces the stored value to what the picker compares against", () => {
    expect(normalizeTime("14:30:00")).toBe("14:30");
    expect(normalizeTime("9:00")).toBe("09:00");
    expect(normalizeTime(null)).toBe("");
  });
});

describe("describeCallback", () => {
  it("says the day on its own when no time was agreed", () => {
    expect(describeCallback("2026-07-30")).toMatch(/Jul/);
    expect(describeCallback("2026-07-30")).not.toMatch(/am|pm/);
  });

  it("adds the time when there is one", () => {
    expect(describeCallback("2026-07-30", "14:30")).toMatch(/2:30 pm$/);
  });

  // Parsing a bare date as UTC would render the previous day everywhere west
  // of Greenwich, which is where every caller is.
  it("does not slip a day backwards", () => {
    expect(describeCallback("2026-07-30")).toMatch(/30/);
  });

  it("is empty without a date, whatever the time says", () => {
    expect(describeCallback(null, "14:30")).toBe("");
  });
});
