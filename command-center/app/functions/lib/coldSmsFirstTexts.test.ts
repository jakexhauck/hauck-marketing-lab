import { describe, it, expect } from "vitest";
import { earliestOutbound, nextDay, zoneDayRange } from "./coldSmsFirstTexts";

describe("earliestOutbound", () => {
  it("keeps each contact's earliest outbound and ignores replies", () => {
    const m = earliestOutbound([
      { contactId: "a", direction: "outbound", dateAdded: "2026-10-09T15:00:00Z" },
      { contactId: "a", direction: "outbound", dateAdded: "2026-10-09T13:00:00Z" },
      { contactId: "a", direction: "inbound", dateAdded: "2026-10-09T12:00:00Z" },
      { contactId: "b", direction: "inbound", dateAdded: "2026-10-09T12:00:00Z" },
      { direction: "outbound", dateAdded: "2026-10-09T12:00:00Z" },
    ]);
    expect([...m]).toEqual([["a", "2026-10-09T13:00:00.000Z"]]);
  });
});

describe("day helpers", () => {
  it("steps a day across a month end", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
  });
  it("a New York day runs midnight to midnight local", () => {
    expect(zoneDayRange("2026-10-09", "America/New_York")).toEqual({
      start: "2026-10-09T04:00:00.000Z",
      end: "2026-10-10T04:00:00.000Z",
    });
  });
  it("handles the November changeover day (25 hours)", () => {
    expect(zoneDayRange("2026-11-01", "America/New_York")).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
    });
  });
});
