import type { Env, ApiData } from "../../lib/env";
import { tenantTimezone } from "../../lib/env";
import { type GhlContext } from "../../lib/ghl";
import { getFreeSlots, resolveCalendarByName } from "../lib/appointments";
import { startOfTodayMs } from "../../lib/tz";

// GET /api/handoffs/slots?calendar=home-estimate|job&date=YYYY-MM-DD (owner
// endpoint). Real open times on the Home Estimate / Job calendar for one day, so
// the Leads -> Schedule booking flow offers slots the customer can actually take.
// Resolves the calendar BY NAME per tenant; never retried on the client (a
// missing-calendar / needs-staff answer is permanent, not transient).

const CALENDAR_NAME: Record<string, string> = {
  "home-estimate": "Home Estimate",
  job: "Job",
};

// Midnight (zone) of an arbitrary YYYY-MM-DD, via startOfTodayMs seeded with
// that date's UTC noon (safely inside the day for every zone).
function startOfDateMs(zone: string, dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const noonUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (!Number.isFinite(noonUtc)) return null;
  return startOfTodayMs(zone, noonUtc);
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const url = new URL(ctx.request.url);
  const calKey = (url.searchParams.get("calendar") ?? "").trim().toLowerCase();
  const date = (url.searchParams.get("date") ?? "").trim();
  const calName = CALENDAR_NAME[calKey];
  if (!calName) return Response.json({ error: "invalid_calendar" }, { status: 400 });

  const zone = tenantTimezone(ctx.env);
  const startMs = startOfDateMs(zone, date);
  if (startMs === null) return Response.json({ error: "invalid_date" }, { status: 400 });
  const endMs = startMs + 86_400_000;

  const calId = await resolveCalendarByName(gctx, calName);
  if (!calId) return Response.json({ ok: false, error: "calendar_not_found", slots: [] });

  const result = await getFreeSlots(gctx, calId, startMs, endMs, zone);
  if (!result.ok) {
    return Response.json({
      ok: false,
      error: result.needsStaff ? "calendar_needs_staff" : "slots_failed",
      slots: [],
    });
  }

  const slots = result.days.flatMap((d) => d.slots);
  return Response.json({ ok: true, timezone: zone, slots });
};
