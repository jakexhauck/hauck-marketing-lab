import { describe, it, expect } from "vitest";
import { parseEventsQuery } from "./events";

// parseEventsQuery is the only pure logic in this route (the rest is a live
// CRM round-trip), so this covers every 400 path plus the ISO to epoch-ms
// conversion the GHL events endpoint requires.
//
// The range cap is the reason invalid_range exists as a separate code from
// missing_range: one active calendar per request per week is cheap, but a
// setter dragging the range out to a year would fan out a request per calendar
// over a window GHL will not usefully answer.

function qs(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe("parseEventsQuery", () => {
  it("requires tenantId", () => {
    const r = parseEventsQuery(
      qs({ start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("rejects a blank tenantId", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "   ", start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("requires an end when only a start is given", () => {
    const r = parseEventsQuery(qs({ tenantId: "t1", start: "2026-07-20T00:00:00Z" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  it("requires a start when only an end is given", () => {
    const r = parseEventsQuery(qs({ tenantId: "t1", end: "2026-07-27T00:00:00Z" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  it("rejects a blank range", () => {
    const r = parseEventsQuery(qs({ tenantId: "t1", start: "  ", end: "  " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  // An unparseable date would otherwise interpolate startTime=NaN into the GHL
  // query, which returns nothing for every calendar and reads as "no bookings"
  // rather than as an error.
  it("rejects an unparseable date", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "nonsense", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_range");
  });

  it("rejects an inverted range", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "2026-07-27T00:00:00Z", end: "2026-07-20T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_range");
  });

  it("rejects a zero-width range", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "2026-07-20T00:00:00Z", end: "2026-07-20T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_range");
  });

  it("rejects a range wider than 62 days", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "2026-01-01T00:00:00Z", end: "2026-06-01T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_range");
  });

  // Two months is the widest the Month view can ask for after paging, so the
  // cap has to sit above it rather than clip a legitimate view.
  it("accepts a range exactly at the 62 day cap", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "2026-01-01T00:00:00Z", end: "2026-03-04T00:00:00Z" }),
    );
    expect(r.ok).toBe(true);
  });

  it("accepts a valid week and returns epoch ms", () => {
    const r = parseEventsQuery(
      qs({ tenantId: "t1", start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r).toEqual({
      ok: true,
      query: {
        tenantId: "t1",
        startMs: Date.parse("2026-07-20T00:00:00Z"),
        endMs: Date.parse("2026-07-27T00:00:00Z"),
      },
    });
  });

  it("trims tenantId and the range bounds", () => {
    const r = parseEventsQuery(
      qs({
        tenantId: "  t1  ",
        start: "  2026-07-20T00:00:00Z  ",
        end: "  2026-07-27T00:00:00Z  ",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.tenantId).toBe("t1");
      expect(r.query.startMs).toBe(Date.parse("2026-07-20T00:00:00Z"));
    }
  });
});
