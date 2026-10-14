import { describe, expect, it } from "vitest";
import { bookingFieldValues } from "./leadBoardGhl";

describe("bookingFieldValues", () => {
  it("writes the date and time the customer will see, in the client's zone", () => {
    // 14:30Z on Oct 10 is 10:30 AM in Detroit (EDT).
    expect(bookingFieldValues("2026-10-10T14:30:00Z", "America/Detroit")).toEqual({
      date: "2026-10-10",
      time: "10:30 AM",
    });
  });
  it("rolls the date when the zone is still on the previous day", () => {
    // 02:00Z on Oct 11 is 9:00 PM Oct 10 in Chicago (CDT).
    expect(bookingFieldValues("2026-10-11T02:00:00Z", "America/Chicago")).toEqual({
      date: "2026-10-10",
      time: "9:00 PM",
    });
  });
});
