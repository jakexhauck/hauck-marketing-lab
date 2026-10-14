import { describe, it, expect } from "vitest";
import {
  defaultCalendarId,
  splitName,
  toE164,
  slotTime,
  dayChip,
  canAdvance,
  type QuickBookDraft,
} from "./quickBook";

const CALS = [
  { id: "a", name: "Job" },
  { id: "b", name: "Home Estimate" },
  { id: "c", name: "Phone Appointment" },
];

describe("defaultCalendarId", () => {
  it("keeps the remembered calendar when it still exists", () => {
    expect(defaultCalendarId(CALS, "c")).toBe("c");
  });
  it("falls back to the estimate calendar", () => {
    expect(defaultCalendarId(CALS, "gone")).toBe("b");
    expect(defaultCalendarId(CALS, null)).toBe("b");
  });
  it("takes the first calendar when none says estimate", () => {
    expect(defaultCalendarId([{ id: "x", name: "Consult" }], null)).toBe("x");
  });
  it("returns empty for no calendars", () => {
    expect(defaultCalendarId([], null)).toBe("");
  });
});

describe("splitName", () => {
  it("splits on the first space", () => {
    expect(splitName("Dana van Kowalski")).toEqual({ firstName: "Dana", lastName: "van Kowalski" });
  });
  it("handles a single name", () => {
    expect(splitName(" Dana ")).toEqual({ firstName: "Dana", lastName: "" });
  });
});

describe("toE164", () => {
  it("adds +1 to a 10 digit US number", () => {
    expect(toE164("(512) 555-0143")).toBe("+15125550143");
  });
  it("keeps an 11 digit number starting with 1", () => {
    expect(toE164("1 512 555 0143")).toBe("+15125550143");
  });
  it("leaves an already international number alone", () => {
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("returns the trimmed input when it cannot tell", () => {
    expect(toE164("555-01")).toBe("555-01");
  });
});

describe("slotTime", () => {
  it("renders the wall clock in the client's zone, not the phone's", () => {
    expect(slotTime("2026-09-23T10:00:00-04:00", "America/Detroit")).toBe("10:00 AM");
    expect(slotTime("2026-09-23T10:00:00-04:00", "America/Chicago")).toBe("9:00 AM");
  });
});

describe("dayChip", () => {
  it("reads the date string as a calendar day, never shifted by zone", () => {
    expect(dayChip("2026-09-23")).toEqual({ dow: "Wed", day: "23", month: "Sep" });
  });
});

describe("canAdvance", () => {
  const draft: QuickBookDraft = {
    tenantId: "t",
    calendarId: "c",
    contactId: "",
    firstName: "Dana",
    lastName: "",
    phone: "+15125550143",
    email: "",
    slot: "",
  };
  it("Who needs a first name and phone for a new prospect, nothing more for an existing one", () => {
    expect(canAdvance(0, draft)).toBe(true);
    expect(canAdvance(0, { ...draft, firstName: " " })).toBe(false);
    expect(canAdvance(0, { ...draft, phone: "" })).toBe(false);
    expect(canAdvance(0, { ...draft, phone: "", firstName: "", contactId: "c1" })).toBe(true);
  });
  it("Who also needs a client and a calendar", () => {
    expect(canAdvance(0, { ...draft, calendarId: "" })).toBe(false);
  });
  it("When needs a slot", () => {
    expect(canAdvance(1, draft)).toBe(false);
    expect(canAdvance(1, { ...draft, slot: "2026-09-23T10:00:00-04:00" })).toBe(true);
  });
  it("Details is always optional", () => {
    expect(canAdvance(2, draft)).toBe(true);
  });
});
