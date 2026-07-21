import { describe, it, expect } from "vitest";
import { validateBookBody } from "./book";

// validateBookBody is the only pure logic in this route (the rest is a live
// CRM round-trip through the non-retrying createAppointment), so this covers
// every 400 path before a request can reach the booking write.
//
// The route takes a calendarId now, not a calendarName: the picker chooses
// from the real list served by ./calendars, so a name lookup in the middle
// would only be a lossy round trip.

const CAL = "cal_7f3a91";
const START = "2026-08-01T10:00:00-05:00";
const END = "2026-08-01T11:00:00-05:00";

describe("validateBookBody", () => {
  it("requires tenantId", () => {
    const r = validateBookBody({
      calendarId: CAL,
      contactId: "c1",
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("requires calendarId", () => {
    const r = validateBookBody({
      tenantId: "t1",
      contactId: "c1",
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_calendar_id");
  });

  it("rejects a blank calendarId", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarId: "   ",
      contactId: "c1",
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_calendar_id");
  });

  it("does not accept the retired calendarName field as a substitute", () => {
    const r = validateBookBody({
      tenantId: "t1",
      contactId: "c1",
      startTime: START,
      endTime: END,
      // Simulates an un-migrated caller still sending the old field.
      ...({ calendarName: "Home Estimate" } as Record<string, string>),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_calendar_id");
  });

  it("requires contactId", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarId: CAL,
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_contact_id");
  });

  it("requires both startTime and endTime", () => {
    const missingEnd = validateBookBody({
      tenantId: "t1",
      calendarId: CAL,
      contactId: "c1",
      startTime: START,
    });
    expect(missingEnd.ok).toBe(false);
    expect(missingEnd.code).toBe("missing_time_range");

    const missingStart = validateBookBody({
      tenantId: "t1",
      calendarId: CAL,
      contactId: "c1",
      endTime: END,
    });
    expect(missingStart.ok).toBe(false);
    expect(missingStart.code).toBe("missing_time_range");
  });

  it("rejects blank strings the same as missing fields", () => {
    const r = validateBookBody({
      tenantId: "  ",
      calendarId: CAL,
      contactId: "c1",
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("accepts a complete body, title optional", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarId: CAL,
      contactId: "c1",
      startTime: START,
      endTime: END,
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a complete body with a title", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarId: CAL,
      contactId: "c1",
      startTime: START,
      endTime: END,
      title: "Estimate with Jane",
    });
    expect(r.ok).toBe(true);
  });
});
