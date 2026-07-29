import { describe, expect, it } from "vitest";
import { isDeadStatus, nameFromEvent, needsUpdate, pickSalesCalendars } from "./salesCallSync";
import type { CalendarEvent } from "./appointments";

// The agency account as it actually is. The Onboarding calendar is linked to a
// personal Google account, which is why "read every calendar" is wrong.
const AGENCY_CALENDARS = [
  { id: "NK53JD0np0dfOaRpmUWh", name: "Hauck Marketing Onboarding" },
  { id: "bNngVkJWa6qNGw18whfp", name: "Hauck Marketing Demo Call" },
];

describe("pickSalesCalendars", () => {
  it("takes the demo calendar and leaves the onboarding one alone", () => {
    expect(pickSalesCalendars(AGENCY_CALENDARS)).toEqual(["bNngVkJWa6qNGw18whfp"]);
  });

  it("recognises the other names a sales calendar goes by", () => {
    const calendars = [
      { id: "a", name: "Discovery Call" },
      { id: "b", name: "Sales Consult" },
      { id: "c", name: "Team Standup" },
    ];
    expect(pickSalesCalendars(calendars)).toEqual(["a", "b"]);
  });

  it("lets an explicit list override the name test entirely", () => {
    expect(pickSalesCalendars(AGENCY_CALENDARS, "NK53JD0np0dfOaRpmUWh")).toEqual([
      "NK53JD0np0dfOaRpmUWh",
    ]);
  });

  it("accepts a list with spaces and empty entries in it", () => {
    expect(pickSalesCalendars(AGENCY_CALENDARS, " bNngVkJWa6qNGw18whfp , ")).toEqual([
      "bNngVkJWa6qNGw18whfp",
    ]);
  });

  it("drops a configured id the account does not have", () => {
    // A stale id would otherwise read as "that calendar had no meetings" for
    // as long as nobody looked.
    expect(pickSalesCalendars(AGENCY_CALENDARS, "gone-calendar")).toEqual([]);
  });

  it("returns nothing rather than everything when no calendar matches", () => {
    // The failure this whole function exists to prevent. Falling back to all
    // calendars is what put flights on the sales meetings page.
    const calendars = [{ id: "x", name: "Personal" }];
    expect(pickSalesCalendars(calendars)).toEqual([]);
    expect(pickSalesCalendars([])).toEqual([]);
  });
});

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "appt-1",
    title: "Discovery call - Tom Hale",
    startTime: "2026-08-03T15:00:00.000Z",
    endTime: "2026-08-03T15:30:00.000Z",
    status: "confirmed",
    contactId: "c-1",
    calendarId: "cal-demo",
    calendarName: "Hauck Marketing Demo Call",
    contactName: "Tom Hale",
    ...over,
  };
}

describe("nameFromEvent", () => {
  it("prefers the contact over the appointment title", () => {
    expect(nameFromEvent(event())).toBe("Tom Hale");
  });

  it("pulls the name out of the title when there is no contact", () => {
    expect(nameFromEvent(event({ contactName: "" }))).toBe("Tom Hale");
  });

  it("keeps a title that has no name in it rather than inventing one", () => {
    expect(nameFromEvent(event({ contactName: "", title: "Strategy session" }))).toBe(
      "Strategy session",
    );
  });

  it("keeps every part of a name that itself contains a dash", () => {
    expect(
      nameFromEvent(event({ contactName: "", title: "Discovery call - Mary-Jo - Acme" })),
    ).toBe("Mary-Jo - Acme");
  });

  it("says so plainly when the calendar gave nothing", () => {
    expect(nameFromEvent(event({ contactName: "", title: "" }))).toBe("Unnamed prospect");
  });
});

describe("needsUpdate", () => {
  const row = {
    id: "row-1",
    ghl_appointment_id: "appt-1",
    scheduled_at: "2026-08-03T15:00:00.000Z",
    appointment_status: "confirmed",
    prospect_name: "Tom Hale",
    ghl_contact_id: "c-1",
  };

  it("is false when nothing GoHighLevel owns has moved", () => {
    expect(needsUpdate(row, event())).toBe(false);
  });

  it("ignores a difference that is only how the timestamp was written", () => {
    // "+00:00" and "Z" are the same instant. Comparing the strings would
    // rewrite every row on every sync.
    expect(needsUpdate(row, event({ startTime: "2026-08-03T15:00:00+00:00" }))).toBe(false);
  });

  it("is true when the meeting was moved", () => {
    expect(needsUpdate(row, event({ startTime: "2026-08-04T15:00:00.000Z" }))).toBe(true);
  });

  it("is true when the meeting was cancelled on the calendar", () => {
    expect(needsUpdate(row, event({ status: "cancelled" }))).toBe(true);
  });

  it("is true when a row with no time is given one", () => {
    expect(needsUpdate({ ...row, scheduled_at: null }, event())).toBe(true);
  });

  it("is false when both sides have no time at all", () => {
    expect(
      needsUpdate({ ...row, scheduled_at: null }, event({ startTime: null })),
    ).toBe(false);
  });
});

describe("isDeadStatus", () => {
  it("recognises the spellings GoHighLevel actually returns", () => {
    expect(isDeadStatus("cancelled")).toBe(true);
    expect(isDeadStatus("canceled")).toBe(true);
    expect(isDeadStatus("No Show")).toBe(true);
    expect(isDeadStatus("noshow")).toBe(true);
  });

  it("leaves a live meeting alone", () => {
    expect(isDeadStatus("confirmed")).toBe(false);
    expect(isDeadStatus("booked")).toBe(false);
    expect(isDeadStatus("showed")).toBe(false);
  });
});
