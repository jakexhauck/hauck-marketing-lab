import { describe, it, expect } from "vitest";
import { validateBookBody } from "./book";

// validateBookBody is the only pure logic in this route (the rest is a live
// CRM round-trip through the non-retrying createAppointment), so this covers
// every 400 path before a request can reach the booking write.

describe("validateBookBody", () => {
  it("requires tenantId", () => {
    const r = validateBookBody({
      calendarName: "Home Estimate",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("requires calendarName", () => {
    const r = validateBookBody({
      tenantId: "t1",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_calendar_name");
  });

  it("requires contactId", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarName: "Home Estimate",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_contact_id");
  });

  it("requires both startTime and endTime", () => {
    const missingEnd = validateBookBody({
      tenantId: "t1",
      calendarName: "Home Estimate",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
    });
    expect(missingEnd.ok).toBe(false);
    expect(missingEnd.code).toBe("missing_time_range");

    const missingStart = validateBookBody({
      tenantId: "t1",
      calendarName: "Home Estimate",
      contactId: "c1",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(missingStart.ok).toBe(false);
    expect(missingStart.code).toBe("missing_time_range");
  });

  it("rejects blank strings the same as missing fields", () => {
    const r = validateBookBody({
      tenantId: "  ",
      calendarName: "Home Estimate",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("accepts a complete body, title optional", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarName: "Home Estimate",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a complete body with a title", () => {
    const r = validateBookBody({
      tenantId: "t1",
      calendarName: "Home Estimate",
      contactId: "c1",
      startTime: "2026-08-01T10:00:00-05:00",
      endTime: "2026-08-01T11:00:00-05:00",
      title: "Estimate with Jane",
    });
    expect(r.ok).toBe(true);
  });
});
