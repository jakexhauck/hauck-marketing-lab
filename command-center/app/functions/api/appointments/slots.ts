import type { Env, ApiData } from "../../lib/env";
import { tenantTimezone } from "../../lib/env";
import { type GhlContext } from "../../lib/ghl";
import { resolveCalendarByName, getFreeSlots } from "../lib/appointments";

// GET /api/appointments/slots?calendarName=Home%20Estimate&days=14
// Available booking slots for a named calendar, grouped by day. The client picks
// one and POSTs /api/appointments. Resolves the calendar id by name server-side.
//
// Returns { ok:true, timezone, days:[{date, slots:[iso]}] } or, when the calendar
// is a round-robin with no team members, 422 { error:"needs_staff" } so the
// picker shows an honest "this calendar needs staff assigned in your booking
// setup" note instead of an empty list.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const url = new URL(ctx.request.url);
  const calendarName = url.searchParams.get("calendarName");
  const calendarIdParam = url.searchParams.get("calendarId");
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days")) || 14, 1),
    31,
  );

  let calendarId = calendarIdParam;
  if (!calendarId && calendarName) {
    calendarId = await resolveCalendarByName(gctx, calendarName);
  }
  if (!calendarId) {
    return Response.json(
      { error: "calendar_not_found", calendar: calendarName },
      { status: 422 },
    );
  }

  const now = Date.now();
  const startMs = now;
  const endMs = now + days * 24 * 60 * 60_000;
  const timezone = tenantTimezone(ctx.env);

  const result = await getFreeSlots(gctx, calendarId, startMs, endMs, timezone);
  if (!result.ok) {
    if (result.needsStaff) {
      return Response.json({ error: "needs_staff" }, { status: 422 });
    }
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, timezone, days: result.days });
};
