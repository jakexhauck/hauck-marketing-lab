import { describe, it, expect } from "vitest";
import { parseBusyQuery } from "./busy";

// parseBusyQuery is the only pure logic in this route (the rest is a Composio
// round-trip), so this covers both 400 paths plus the pass-through before a
// request ever reaches Google.
//
// Deliberately no ms conversion, unlike the events route: getBusy hands
// timeMin/timeMax to GOOGLECALENDAR_FIND_FREE_SLOTS, which wants ISO-8601.

function qs(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe("parseBusyQuery", () => {
  it("requires tenantId", () => {
    const r = parseBusyQuery(
      qs({ start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("rejects a blank tenantId", () => {
    const r = parseBusyQuery(
      qs({ tenantId: "   ", start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("requires an end when only a start is given", () => {
    const r = parseBusyQuery(qs({ tenantId: "t1", start: "2026-07-20T00:00:00Z" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  it("requires a start when only an end is given", () => {
    const r = parseBusyQuery(qs({ tenantId: "t1", end: "2026-07-27T00:00:00Z" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  it("rejects a blank range", () => {
    const r = parseBusyQuery(qs({ tenantId: "t1", start: "  ", end: "  " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_range");
  });

  it("passes ISO strings straight through, since getBusy wants ISO not ms", () => {
    const r = parseBusyQuery(
      qs({ tenantId: "t1", start: "2026-07-20T00:00:00Z", end: "2026-07-27T00:00:00Z" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query).toEqual({
        tenantId: "t1",
        timeMin: "2026-07-20T00:00:00Z",
        timeMax: "2026-07-27T00:00:00Z",
      });
    }
  });

  it("trims tenantId and the range bounds", () => {
    const r = parseBusyQuery(
      qs({
        tenantId: "  t1  ",
        start: "  2026-07-20T00:00:00Z  ",
        end: "  2026-07-27T00:00:00Z  ",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.tenantId).toBe("t1");
      expect(r.query.timeMin).toBe("2026-07-20T00:00:00Z");
      expect(r.query.timeMax).toBe("2026-07-27T00:00:00Z");
    }
  });
});
