import { describe, it, expect } from "vitest";
import { addDays, dueMinutes, followUpLabel, followUpState, isDay, isTime, timeLabel } from "./coldSmsFollowUp";

describe("cold SMS follow-ups", () => {
  it("knows due, overdue and later", () => {
    expect(followUpState("2026-10-13", "2026-10-13")).toBe("due");
    expect(followUpState("2026-10-12", "2026-10-13")).toBe("overdue");
    expect(followUpState("2026-10-20", "2026-10-13")).toBe("later");
  });
  it("adds days across a month end", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-13", 7)).toBe("2026-10-20");
  });
  it("labels the day without shifting it", () => {
    expect(followUpLabel("2026-10-16")).toBe("Fri, Oct 16");
  });
  it("accepts only real calendar days", () => {
    expect(isDay("2026-10-16")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("10/16/2026")).toBe(false);
    expect(isDay(null)).toBe(false);
  });
});

describe("follow-up time", () => {
  it("accepts only HH:MM", () => {
    expect(isTime("14:05")).toBe(true);
    expect(isTime("9:05")).toBe(false);
    expect(isTime("24:00")).toBe(false);
    expect(isTime(null)).toBe(false);
  });
  it("labels on a 12-hour clock", () => {
    expect(timeLabel("14:05")).toBe("2:05 PM");
    expect(timeLabel("00:30")).toBe("12:30 AM");
    expect(timeLabel("12:00")).toBe("12:00 PM");
  });
  it("is due at the time given, else 9am", () => {
    expect(dueMinutes("14:30")).toBe(870);
    expect(dueMinutes(null)).toBe(540);
  });
});
