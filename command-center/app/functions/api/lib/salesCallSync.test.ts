import { describe, expect, it } from "vitest";
import {
  businessFromContact,
  contactsToLookUp,
  businessFromLead,
  isCalendarFurniture,
  isDeadStatus,
  nameFromContact,
  leadBookings,
  nameFromEvent,
  nameFromLead,
  needsUpdate,
  pickSalesCalendars,
  type BookableLead,
} from "./salesCallSync";
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

describe("nameFromLead", () => {
  const lead: BookableLead = {
    id: "lead-1",
    ghl_contact_id: "c-1",
    status: "New Lead",
    appointment_date: null,
    first_name: "Honeycutt",
    last_name: "Heating & Cooling",
  };

  it("uses the book's own name for the prospect", () => {
    // Beats "Hauck Marketing X  Rich Honey Cut Heating Rich", which is what the
    // calendar title gives and what the page would otherwise show.
    expect(nameFromLead(lead)).toBe("Honeycutt Heating & Cooling");
  });

  it("copes with half a name", () => {
    expect(nameFromLead({ ...lead, last_name: "" })).toBe("Honeycutt");
    expect(nameFromLead({ ...lead, first_name: null, last_name: null })).toBe("");
  });

  it("is empty when there is no lead, so the caller falls back to the title", () => {
    expect(nameFromLead(undefined)).toBe("");
  });
});

describe("businessFromLead", () => {
  const lead: BookableLead = {
    id: "lead-1",
    ghl_contact_id: "c-1",
    status: "New Lead",
    appointment_date: null,
    first_name: "Mohamad",
    last_name: "Heating & Cooling",
    business_name: "BM Heating & Cooling",
  };

  // The Sales Data sheet's Name column reads this and nothing else, so it is
  // the book's own business_name or it is empty. Guessing a company out of a
  // person's name is how "Mohamad Heating & Cooling" got printed for a company
  // called BM Heating & Cooling.
  it("takes the book's business name", () => {
    expect(businessFromLead(lead)).toBe("BM Heating & Cooling");
  });

  it("stays empty rather than guessing one out of the person", () => {
    expect(businessFromLead({ ...lead, business_name: "  " })).toBe("");
    expect(businessFromLead({ ...lead, business_name: null })).toBe("");
    expect(businessFromLead(undefined)).toBe("");
  });
});

describe("the contact record behind the meeting", () => {
  // Live, 2026-08-25. The lead book's older HVAC rows carry no business_name at
  // all and have the company mangled across first + last ("Deniya" + "Helpers
  // Today Heating Cooling and Labor Services LLC"). GoHighLevel's contact has
  // held the real one the whole time.
  it("takes the company off the contact", () => {
    expect(
      businessFromContact({
        id: "c-1",
        firstName: "Deniya",
        lastName: "Helpers Today Heating Cooling and Labor Services LLC",
        companyName: "Good Helpers Today Heating Cooling and Labor Services LLC",
      }),
    ).toBe("Good Helpers Today Heating Cooling and Labor Services LLC");
  });

  it("is empty for a contact that is a person, not a business", () => {
    // Dom Crowe, Seamus Geoghegan, Jake himself: real contacts with no company
    // on them. Nothing is invented out of their names.
    expect(businessFromContact({ id: "c-2", firstName: "Dom", lastName: "Crowe" })).toBe("");
    expect(businessFromContact({ id: "c-3", companyName: "  " })).toBe("");
    expect(businessFromContact(null)).toBe("");
  });

  it("gives the person's own name, properly", () => {
    expect(nameFromContact({ id: "c-2", firstName: "Dom", lastName: "Crowe" })).toBe("Dom Crowe");
    expect(nameFromContact({ id: "c-4", firstName: "", lastName: "" })).toBe("");
    expect(nameFromContact(null)).toBe("");
  });
});

describe("contactsToLookUp", () => {
  const leads = new Map<string, BookableLead>([
    [
      "c-book",
      {
        id: "lead-1",
        ghl_contact_id: "c-book",
        status: "New Lead",
        appointment_date: null,
        business_name: "Becker Windows LLC",
      },
    ],
  ]);

  it("asks about a meeting whose company nobody knows", () => {
    const events = [event({ id: "a-1", contactId: "c-new" })];
    expect(contactsToLookUp(events, new Map(), leads, 15)).toEqual(["c-new"]);
  });

  it("does not ask when the lead book already has the company", () => {
    const events = [event({ id: "a-1", contactId: "c-book" })];
    expect(contactsToLookUp(events, new Map(), leads, 15)).toEqual([]);
  });

  it("does not ask again once the row has a business name", () => {
    const events = [event({ id: "a-1", contactId: "c-new" })];
    const existing = new Map([["a-1", { business_name: "Honeycutt Heating & Cooling" }]]);
    expect(contactsToLookUp(events, existing, leads, 15)).toEqual([]);
  });

  // The bug this function was extracted to fix. The gate used to skip any row
  // whose stored name already read like a name, which is every row that needed
  // fixing: "Mohamad Heating & Cooling" reads like a name and is half of BM
  // Heating & Cooling.
  it("still asks about a row whose stored name merely looks like one", () => {
    const events = [event({ id: "a-1", contactId: "c-new" })];
    const existing = new Map([["a-1", { business_name: "" }]]);
    expect(contactsToLookUp(events, existing, leads, 15)).toEqual(["c-new"]);
  });

  it("spends the cap on the most recent meetings", () => {
    const events = [
      event({ id: "a-old", contactId: "c-old", startTime: "2026-06-01T15:00:00.000Z" }),
      event({ id: "a-new", contactId: "c-newest", startTime: "2026-08-20T15:00:00.000Z" }),
    ];
    expect(contactsToLookUp(events, new Map(), leads, 1)).toEqual(["c-newest"]);
  });

  it("asks about one contact once, however many meetings it has", () => {
    const events = [
      event({ id: "a-1", contactId: "c-twice" }),
      event({ id: "a-2", contactId: "c-twice", startTime: "2026-08-04T15:00:00.000Z" }),
    ];
    expect(contactsToLookUp(events, new Map(), leads, 15)).toEqual(["c-twice"]);
  });
});

describe("isCalendarFurniture", () => {
  // What the sheet was showing instead of a name. All four are the agency
  // calendar's own event title leaking into the Name column.
  it("knows the calendar's own words when it sees them", () => {
    expect(isCalendarFurniture("Hauck Marketing Demo Call")).toBe(true);
    expect(isCalendarFurniture("Hauck Marketing X Nathan")).toBe(true);
    expect(isCalendarFurniture("Hauck Marketing X  Dom Crowe Dom")).toBe(true);
    expect(isCalendarFurniture("Jake Hauck x Hauck Marketing")).toBe(true);
    expect(isCalendarFurniture("   ")).toBe(true);
  });

  it("leaves a real name alone", () => {
    expect(isCalendarFurniture("Dom Crowe")).toBe(false);
    expect(isCalendarFurniture("Honeycutt Heating & Cooling")).toBe(false);
  });
});

describe("needsUpdate", () => {
  const row = {
    id: "row-1",
    ghl_appointment_id: "appt-1",
    scheduled_at: "2026-08-03T15:00:00.000Z",
    appointment_status: "confirmed",
    prospect_name: "Tom Hale",
    business_name: "Hale Roofing",
    ghl_contact_id: "c-1",
    lead_id: null,
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

describe("leadBookings", () => {
  // The booking that produced this function. Honeycutt Heating booked itself a
  // demo through the widget on the cold call calendar, and the lead book sat
  // there saying New Lead.
  const NOW = Date.parse("2026-08-14T21:30:00.000Z");

  const coldCall = (over: Partial<CalendarEvent> = {}): CalendarEvent =>
    event({
      id: "appt-honeycutt",
      contactId: "mpCk5KQfmz3nwRGKUDfH",
      contactName: "rich honey cut heating",
      calendarId: "88RWwB2ki5xVTFMn4Xz3",
      calendarName: "Demo Call - Cold Call",
      startTime: "2026-08-17T16:00:00-04:00",
      endTime: "2026-08-17T16:30:00-04:00",
      ...over,
    });

  const lead = (over: Partial<BookableLead> = {}): BookableLead => ({
    id: "lead-1",
    ghl_contact_id: "mpCk5KQfmz3nwRGKUDfH",
    status: "New Lead",
    appointment_date: null,
    ...over,
  });

  it("marks the prospect Booked on the day of their meeting", () => {
    expect(leadBookings([coldCall()], [lead()], NOW)).toEqual([
      { leadId: "lead-1", appointmentDate: "2026-08-17" },
    ]);
  });

  it("takes the day from the calendar's own offset, not from UTC", () => {
    // 00:30 on the 18th in London is still the 17th where the meeting is.
    const bookings = leadBookings([coldCall({ startTime: "2026-08-17T20:30:00-04:00" })], [lead()], NOW);
    expect(bookings[0].appointmentDate).toBe("2026-08-17");
  });

  it("ignores a meeting whose contact is in nobody's book", () => {
    expect(leadBookings([coldCall({ contactId: "stranger" })], [lead()], NOW)).toEqual([]);
    expect(leadBookings([coldCall({ contactId: "" })], [lead()], NOW)).toEqual([]);
  });

  it("leaves a demo that is not a cold call alone", () => {
    // Jake's own demo calendar. The Booked page would never show the meeting,
    // so the lead must not claim to have one.
    expect(
      leadBookings([coldCall({ calendarName: "Hauck Marketing Demo Call" })], [lead()], NOW),
    ).toEqual([]);
  });

  it("ignores a meeting that was cancelled or nobody turned up to", () => {
    expect(leadBookings([coldCall({ status: "cancelled" })], [lead()], NOW)).toEqual([]);
    expect(leadBookings([coldCall({ status: "noshow" })], [lead()], NOW)).toEqual([]);
  });

  it("does not reach back into meetings that have already happened", () => {
    // The sync reads 90 days back. Re-stamping Booked onto a prospect whose
    // meeting was in June is rewriting the past, not recording it.
    expect(leadBookings([coldCall({ startTime: "2026-06-02T16:00:00-04:00" })], [lead()], NOW)).toEqual(
      [],
    );
  });

  it("still records a meeting earlier today", () => {
    expect(
      leadBookings([coldCall({ startTime: "2026-08-14T09:00:00-04:00" })], [lead()], NOW),
    ).toHaveLength(1);
  });

  it("says nothing about a lead already booked on that day", () => {
    // Every sync would otherwise rewrite the same row forever.
    const settled = lead({ status: "Booked", appointment_date: "2026-08-17" });
    expect(leadBookings([coldCall()], [settled], NOW)).toEqual([]);
  });

  it("follows a meeting that was moved inside GoHighLevel", () => {
    const settled = lead({ status: "Booked", appointment_date: "2026-08-17" });
    const moved = coldCall({ startTime: "2026-08-19T16:00:00-04:00" });
    expect(leadBookings([moved], [settled], NOW)).toEqual([
      { leadId: "lead-1", appointmentDate: "2026-08-19" },
    ]);
  });

  it("books a prospect who had already said no", () => {
    // They booked. Whatever they said last week is no longer the latest fact.
    expect(leadBookings([coldCall()], [lead({ status: "Not Interested" })], NOW)).toHaveLength(1);
  });

  it("gives a prospect with two meetings the next one, once", () => {
    const events = [
      coldCall({ id: "a", startTime: "2026-08-17T16:00:00-04:00" }),
      coldCall({ id: "b", startTime: "2026-08-25T16:00:00-04:00" }),
    ];
    expect(leadBookings(events, [lead()], NOW)).toEqual([
      { leadId: "lead-1", appointmentDate: "2026-08-17" },
    ]);
  });

  it("ignores a meeting with no time on it at all", () => {
    expect(leadBookings([coldCall({ startTime: null })], [lead()], NOW)).toEqual([]);
  });

  it("keeps two prospects apart", () => {
    const events = [coldCall(), coldCall({ id: "b", contactId: "c-2" })];
    const leads = [lead(), lead({ id: "lead-2", ghl_contact_id: "c-2" })];
    expect(leadBookings(events, leads, NOW)).toEqual([
      { leadId: "lead-1", appointmentDate: "2026-08-17" },
      { leadId: "lead-2", appointmentDate: "2026-08-17" },
    ]);
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
