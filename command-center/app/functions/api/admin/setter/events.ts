import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { listCalendarEvents } from "../../lib/appointments";

// GET /api/admin/setter/events?tenantId=&start=&end= (admin-only, gated in
// _middleware.ts). Booked appointments across every one of a client's active
// calendars, so the Setter Suite Calendar tab can show what is already taken
// before a setter offers a time. Read-only.
//
// The client app has functions/api/calendar/events.ts, but it reads
// ctx.data.tenant, which admin requests never have: admin returns early in
// _middleware.ts before tenant resolution runs. So creds resolve per tenant
// through getGhlContextForTenant, which hard-fails on placeholder credentials
// rather than falling back to the env GHL vars (those are a real production
// client's).
//
// The listing itself is listCalendarEvents in ../../lib/appointments, which
// deliberately skips the client route's contact-name map: that pulls up to
// 1000 contacts per request, and this route is hit every time a setter changes
// week. An unnamed contact comes back with an empty contactName and the UI
// falls back to the event title.
//
// Response is { events } and nothing else. The client route also returns a
// timezone, taken from the first calendar that declares one, because it
// renders times for someone sitting in that timezone. Nothing downstream here
// consumes it: appointmentToItem maps startTime through the browser's own
// clock, and the booking panel takes its timezone from ./slots, which uses the
// env-level tenantTimezone. Returning a second, differently-sourced timezone
// that no caller reads would just be a field to get out of sync.

// A setter changing week must not be able to fan out an unbounded number of
// GHL calls per active calendar, so the window is capped. Two months sits
// above the widest the Month view can ask for.
const MAX_RANGE_MS = 62 * 24 * 60 * 60_000;

export interface EventsQuery {
  tenantId: string;
  startMs: number;
  endMs: number;
}

export type ParsedEventsQuery =
  | { ok: true; query: EventsQuery }
  | { ok: false; code: string };

// Pure: validate + normalize the query params, converting the ISO-8601 bounds
// to epoch milliseconds. That conversion is not cosmetic: the GHL events route
// rejects ISO on startTime/endTime, and an unparseable date left alone would
// interpolate NaN into the query and come back empty, which reads as "this
// client has no bookings" rather than as a bad request. Unit-testable without
// a request.
export function parseEventsQuery(params: URLSearchParams): ParsedEventsQuery {
  const tenantId = params.get("tenantId");
  if (!tenantId || !tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !start.trim() || !end || !end.trim()) {
    return { ok: false, code: "missing_range" };
  }

  const startMs = Date.parse(start.trim());
  const endMs = Date.parse(end.trim());
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, code: "invalid_range" };
  }
  if (endMs <= startMs) return { ok: false, code: "invalid_range" };
  if (endMs - startMs > MAX_RANGE_MS) return { ok: false, code: "invalid_range" };

  return { ok: true, query: { tenantId: tenantId.trim(), startMs, endMs } };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const parsed = parseEventsQuery(url.searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
  const { tenantId, startMs, endMs } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const events = await listCalendarEvents(gctx, startMs, endMs);
    return Response.json({ events });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ error: e.code }, { status: e.status });
    }
    // ghlJson throws a plain Error carrying the status and body text, so the
    // CRM failure is surfaced as a 502 rather than a 500 the setter cannot
    // act on.
    const body = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "ghl_error", body }, { status: 502 });
  }
};
