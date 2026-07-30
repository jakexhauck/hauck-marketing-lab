import { describe, it, expect } from "vitest";
import { isColdCallCalendar, pickColdCallCalendars } from "./coldCallCalendar";

// The three calendars the agency account actually holds, verbatim.
const LIVE = [
  { id: "NK53JD0np0dfOaRpmUWh", name: "Hauck Marketing Onboarding" },
  { id: "bNngVkJWa6qNGw18whfp", name: "Hauck Marketing Demo Call" },
  { id: "gPiWbUKfdeSDtBsL6mrY", name: "Hauck Marketing Demo Call - Cold Call" },
];

describe("pickColdCallCalendars", () => {
  it("picks the cold call calendar and nothing else", () => {
    expect(pickColdCallCalendars(LIVE).map((c) => c.id)).toEqual(["gPiWbUKfdeSDtBsL6mrY"]);
  });

  it("does not fall back to a demo calendar when the cold call one is gone", () => {
    // The whole point of the change: no match must mean no booking, not a
    // booking on the next most plausible calendar.
    expect(pickColdCallCalendars(LIVE.slice(0, 2))).toEqual([]);
  });

  it("ignores a nameless calendar", () => {
    expect(pickColdCallCalendars([{ id: "x" }])).toEqual([]);
  });
});

describe("isColdCallCalendar", () => {
  it("reads the name a booked row stored", () => {
    expect(isColdCallCalendar("Hauck Marketing Demo Call - Cold Call")).toBe(true);
    expect(isColdCallCalendar("hauck marketing coldcall")).toBe(true);
  });

  it("rejects the other demo calendar", () => {
    expect(isColdCallCalendar("Hauck Marketing Demo Call")).toBe(false);
    expect(isColdCallCalendar("Hauck Marketing Onboarding")).toBe(false);
  });

  it("treats a row with no calendar name as not ours", () => {
    // Unknown is not the same as ours. Rows written before 0066 carry null
    // until the next sync fills them in.
    expect(isColdCallCalendar(null)).toBe(false);
    expect(isColdCallCalendar("")).toBe(false);
  });
});
