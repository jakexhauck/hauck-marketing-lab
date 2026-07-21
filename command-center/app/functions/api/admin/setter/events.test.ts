import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { listCalendarEvents } from "../../lib/appointments";
import { onRequestGet, parseEventsQuery } from "./events";
import type { Env, ApiData } from "../../../lib/env";

// listCalendarEvents is stubbed here rather than mocked at the ghlJson seam:
// its own fan-out and partial-failure behaviour is covered in
// functions/api/lib/appointments.test.ts, and what this route owns is only how
// a partial read is REPORTED to the setter.
vi.mock("../../lib/appointments", () => ({ listCalendarEvents: vi.fn() }));
vi.mock("../../../lib/tenantGhl", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/tenantGhl")>(
    "../../../lib/tenantGhl",
  );
  return { ...actual, getGhlContextForTenant: vi.fn() };
});

const GCTX = { token: "tok_tenant_own", locationId: "loc_tenant_own" };
const RANGE = "&start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z";

const EV = {
  id: "e1",
  title: "Estimate",
  startTime: "2026-07-24T13:00:00Z",
  endTime: "2026-07-24T14:00:00Z",
  status: "booked",
  contactId: "k1",
  contactName: "Tom Beckett",
};

function req(query: string): Parameters<typeof onRequestGet>[0] {
  return {
    request: new Request(`https://x.test/api/admin/setter/events${query}`),
    env: {} as Env,
    data: { admin: { id: "admin-1" } } as unknown as ApiData,
  } as unknown as Parameters<typeof onRequestGet>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhlContextForTenant).mockResolvedValue(GCTX);
});

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

// The Setter Suite Calendar tab BOOKS. A grid missing one calendar's
// appointments, shown as if it were complete, is how a setter offers a slot
// that is already taken. So the route has to say when the read was partial.
describe("GET /api/admin/setter/events", () => {
  it("returns the events with incomplete:false when every calendar answered", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({
      events: [EV],
      failedCalendarIds: [],
    });

    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      events: [EV],
      incomplete: false,
      failedCalendars: 0,
    });
  });

  it("flags incomplete with a count when a calendar could not be read", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({
      events: [EV],
      failedCalendarIds: ["cBad"],
    });

    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      events: [EV],
      incomplete: true,
      failedCalendars: 1,
    });
  });

  // A partial read is still a 200 with usable events: 502ing here would blank
  // the tab, which is the defect this fix exists to remove.
  it("stays a 200 when every calendar failed, but says the grid is incomplete", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({
      events: [],
      failedCalendarIds: ["cBad1", "cBad2"],
    });

    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      events: [],
      incomplete: true,
      failedCalendars: 2,
    });
  });

  // Raw GHL calendar ids mean nothing to a setter, so the wire carries a count
  // for the warning line and never the ids themselves.
  it("does not leak raw GHL calendar ids to the client", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({
      events: [],
      failedCalendarIds: ["cBad"],
    });

    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(JSON.stringify(await res.json())).not.toContain("cBad");
  });

  it("400s before touching the CRM on a bad query", async () => {
    const res = await onRequestGet(req("?tenantId=t1"));
    expect(res.status).toBe(400);
    expect(getGhlContextForTenant).not.toHaveBeenCalled();
    expect(listCalendarEvents).not.toHaveBeenCalled();
  });

  it("passes the tenant's own creds and the epoch-ms window through", async () => {
    vi.mocked(listCalendarEvents).mockResolvedValue({ events: [], failedCalendarIds: [] });
    await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(listCalendarEvents).toHaveBeenCalledWith(
      GCTX,
      Date.parse("2026-07-20T00:00:00Z"),
      Date.parse("2026-07-27T00:00:00Z"),
    );
  });

  it("surfaces a tenant creds failure with its own status and code", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(409, "tenant_ghl_not_configured", "no creds"),
    );
    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "tenant_ghl_not_configured" });
  });

  // Only a TOTAL failure (the calendar list itself) still 502s: at that point
  // there is no grid to draw and no way to tell an outage from a free week.
  it("502s when the calendar list itself fails", async () => {
    vi.mocked(listCalendarEvents).mockRejectedValue(new Error("GHL 401 /calendars/"));
    const res = await onRequestGet(req(`?tenantId=t1${RANGE}`));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("ghl_error");
  });
});
