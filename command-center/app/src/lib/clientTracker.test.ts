import { describe, it, expect } from "vitest";
import { isStaleTouchpoint, parseSheetDate } from "./clientTracker";

const today = new Date(2026, 9, 7);

describe("parseSheetDate", () => {
  it("reads the sheet's M/D/YY and a four digit year", () => {
    expect(parseSheetDate("1/8/26")?.toDateString()).toBe(new Date(2026, 0, 8).toDateString());
    expect(parseSheetDate("10/2/2026")?.toDateString()).toBe(new Date(2026, 9, 2).toDateString());
  });

  it("reads written-out dates and rejects junk", () => {
    expect(parseSheetDate("Jun 12, 2026")?.getMonth()).toBe(5);
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("soon")).toBeNull();
    expect(parseSheetDate("13/40/26")).toBeNull();
  });
});

describe("isStaleTouchpoint", () => {
  it("flags a touchpoint more than 14 days old", () => {
    expect(isStaleTouchpoint("9/22/26", today)).toBe(true);
    expect(isStaleTouchpoint("9/23/26", today)).toBe(false);
    expect(isStaleTouchpoint("10/7/26", today)).toBe(false);
  });

  it("never flags a blank or unreadable cell", () => {
    expect(isStaleTouchpoint("", today)).toBe(false);
    expect(isStaleTouchpoint("last week", today)).toBe(false);
  });
});
