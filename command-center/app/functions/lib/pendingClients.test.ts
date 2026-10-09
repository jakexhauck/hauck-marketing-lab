import { describe, expect, it } from "vitest";
import {
  closedDateLabel,
  matchPendingClient,
  splitName,
  trackerOwed,
  trackerPrefill,
  type PendingMatchRow,
} from "./pendingClients";

const ROWS: PendingMatchRow[] = [
  { id: "a", email: "Ryan@AAG.com", phone: "(313) 555-0101", businessName: "Above All Garage Doors LLC" },
  { id: "b", email: "", phone: "+1 248 555 0202", businessName: "Clear Choice Windows" },
];

describe("matchPendingClient", () => {
  it("matches on email, ignoring case and spaces", () => {
    expect(matchPendingClient(ROWS, { email: " ryan@aag.com ", phone: "", businessName: "" })).toBe("a");
  });

  it("matches on the last ten digits of the phone", () => {
    expect(matchPendingClient(ROWS, { email: "x@y.com", phone: "248-555-0202", businessName: "" })).toBe("b");
  });

  it("falls back to the business name without its suffix or punctuation", () => {
    expect(
      matchPendingClient(ROWS, { email: "", phone: "", businessName: "Above All Garage Doors, Inc." }),
    ).toBe("a");
  });

  it("prefers an email hit over a name hit on another row", () => {
    expect(
      matchPendingClient(ROWS, { email: "ryan@aag.com", phone: "", businessName: "Clear Choice Windows" }),
    ).toBe("a");
  });

  it("returns null when nothing matches, and never matches blanks to blanks", () => {
    expect(matchPendingClient(ROWS, { email: "", phone: "", businessName: "" })).toBeNull();
    expect(matchPendingClient(ROWS, { email: "no@one.com", phone: "555", businessName: "Other" })).toBeNull();
  });
});

describe("splitName", () => {
  it("puts the first word first and the rest last", () => {
    expect(splitName("  Mary Ann  Smith ")).toEqual({ firstName: "Mary", lastName: "Ann Smith" });
    expect(splitName("Bill")).toEqual({ firstName: "Bill", lastName: "" });
    expect(splitName("")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("closedDateLabel", () => {
  it("writes the meeting day the way the sheet does, in the agency zone", () => {
    expect(closedDateLabel("2026-10-09T15:00:00Z", "America/New_York")).toBe("10/9/26");
    // 1am UTC on the 10th is still the 9th in New York.
    expect(closedDateLabel("2026-10-10T01:00:00Z", "America/New_York")).toBe("10/9/26");
    expect(closedDateLabel(null, "America/New_York")).toBe("");
  });
});

describe("trackerPrefill", () => {
  it("fills the name, the close date and the cash off the meeting", () => {
    expect(
      trackerPrefill(
        { prospectName: "Ryan Michael", scheduledAt: "2026-10-09T15:00:00Z", cashCollected: 1500 },
        "America/New_York",
      ),
    ).toMatchObject({
      firstName: "Ryan",
      lastName: "Michael",
      dateClosed: "10/9/26",
      upfrontCash: 1500,
      totalCashCollected: 1500,
      status: "active",
    });
  });

  it("leaves cash at zero when none was taken", () => {
    expect(
      trackerPrefill({ prospectName: "", scheduledAt: null, cashCollected: null }, "UTC").upfrontCash,
    ).toBe(0);
  });
});

describe("trackerOwed", () => {
  it("is owed on a PIF or Deposit from the start date on, until saved", () => {
    expect(trackerOwed("pif", "2026-10-09T15:00:00Z", false)).toBe(true);
    expect(trackerOwed("deposit", "2026-10-20T15:00:00Z", false)).toBe(true);
    expect(trackerOwed("pif", "2026-10-09T15:00:00Z", true)).toBe(false);
  });

  it("is never owed on another status or on a close before the feature existed", () => {
    expect(trackerOwed("noclose", "2026-10-09T15:00:00Z", false)).toBe(false);
    expect(trackerOwed("", "2026-10-09T15:00:00Z", false)).toBe(false);
    expect(trackerOwed("pif", "2026-10-02T15:00:00Z", false)).toBe(false);
  });
});
