import { describe, it, expect } from "vitest";
import { parseSlotsQuery } from "./slots";
import { isCalendarNotFound } from "../../lib/appointments";

// parseSlotsQuery is the only pure logic in this route (the rest is a live
// CRM round-trip), so this covers every 400 path plus the days clamp before
// a request ever reaches the calendars API.
//
// The route takes a calendarId now, not a calendarName: the picker chooses
// from the real list served by ./calendars, so a name lookup in the middle
// would only be a lossy round trip.

function qs(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe("parseSlotsQuery", () => {
  it("requires tenantId", () => {
    const r = parseSlotsQuery(qs({ calendarId: "cal_123" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("requires calendarId", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_calendar_id");
  });

  it("rejects a blank calendarId", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_calendar_id");
  });

  it("does not accept the retired calendarName param as a substitute", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_calendar_id");
  });

  it("defaults days to 14 when absent", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "cal_123" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("falls back to 14 when days is 0, matching the client-facing endpoint's falsy-catch behavior", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "cal_123", days: "0" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("clamps a negative days value up to 1", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "cal_123", days: "-5" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(1);
  });

  it("clamps days above 31 down to 31", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "cal_123", days: "90" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(31);
  });

  it("falls back to 14 when days is not a number", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarId: "cal_123", days: "abc" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("trims tenantId and calendarId", () => {
    const r = parseSlotsQuery(qs({ tenantId: "  t1  ", calendarId: "  cal_123  " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.tenantId).toBe("t1");
      expect(r.query.calendarId).toBe("cal_123");
    }
  });
});

// isCalendarNotFound lives in ../../lib/appointments with the rest of the
// calendar-API quirks, but slots.ts and book.ts are its only two callers and
// it exists solely to preserve their calendar_not_found response now that the
// name lookup that used to produce it is gone. Covered here rather than in a
// separate lib test so the branch and the routes that depend on it stay
// visibly tied together.
describe("isCalendarNotFound", () => {
  it("treats a 404 as a bad calendar id", () => {
    expect(isCalendarNotFound(404, "")).toBe(true);
  });

  it("recognizes the id-rejection wording in a 4xx body", () => {
    expect(isCalendarNotFound(400, '{"message":"Calendar not found"}')).toBe(true);
    expect(isCalendarNotFound(422, "invalid calendar")).toBe(true);
  });

  it("does NOT claim the calendar is missing for the no-team-members 422", () => {
    expect(
      isCalendarNotFound(422, "The calendar doesn't have any team members associated"),
    ).toBe(false);
  });

  it("does NOT swallow a generic CRM outage", () => {
    expect(isCalendarNotFound(500, "Internal Server Error")).toBe(false);
    expect(isCalendarNotFound(undefined, undefined)).toBe(false);
  });
});
