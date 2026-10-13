import { describe, it, expect } from "vitest";
import { addDays, followUpLabel, followUpState, isDay } from "./coldSmsFollowUp";

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
