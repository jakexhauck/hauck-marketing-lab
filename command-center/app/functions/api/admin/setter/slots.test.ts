import { describe, it, expect } from "vitest";
import { parseSlotsQuery } from "./slots";

// parseSlotsQuery is the only pure logic in this route (the rest is a live
// CRM round-trip), so this covers every 400 path plus the days clamp before
// a request ever reaches the calendars API.

function qs(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe("parseSlotsQuery", () => {
  it("requires tenantId", () => {
    const r = parseSlotsQuery(qs({ calendarName: "Home Estimate" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("requires calendarName", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
  });

  it("rejects a blank calendarName", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
  });

  it("defaults days to 14 when absent", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("falls back to 14 when days is 0, matching the client-facing endpoint's falsy-catch behavior", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "0" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("clamps a negative days value up to 1", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "-5" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(1);
  });

  it("clamps days above 31 down to 31", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "90" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(31);
  });

  it("falls back to 14 when days is not a number", () => {
    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "abc" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.days).toBe(14);
  });

  it("trims tenantId and calendarName", () => {
    const r = parseSlotsQuery(qs({ tenantId: "  t1  ", calendarName: "  Home Estimate  " }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.tenantId).toBe("t1");
      expect(r.query.calendarName).toBe("Home Estimate");
    }
  });
});
