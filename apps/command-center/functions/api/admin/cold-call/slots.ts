import type { Env, ApiData } from "../../../lib/env";
import { getAgencyGhlContext, agencyTimezone, AgencyGhlError } from "../../../lib/agencyGhl";
import { getFreeSlots, isCalendarNotFound } from "../../lib/appointments";

// GET /api/admin/cold-call/slots?calendarId=&days=  (admin-only)
//
// Real open windows on the agency's calendar, so a caller with someone on the
// phone offers a time that actually exists rather than one he then has to
// un-offer. Read-only, so it is safe to hit repeatedly while narrowing down.
//
// Mirrors the Setter Suite's slots route, minus the tenant: there is one agency
// account, so the credentials come from the environment rather than a client.
//
// Degrades honestly: a round-robin calendar with nobody assigned 422s at GHL
// with "no team members", surfaced as needsStaff so the panel can say that
// plainly instead of showing an empty grid that reads as "fully booked".

const MAX_DAYS = 31;

export function parseDays(raw: string | null): number {
  const n = Number(raw ?? "14");
  if (!Number.isFinite(n)) return 14;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_DAYS);
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const params = new URL(ctx.request.url).searchParams;
  const calendarId = (params.get("calendarId") ?? "").trim();
  if (!calendarId) {
    return Response.json({ error: "calendarId is required" }, { status: 400 });
  }
  const days = parseDays(params.get("days"));

  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }

  const now = Date.now();
  const result = await getFreeSlots(
    gctx,
    calendarId,
    now,
    now + days * 24 * 60 * 60 * 1000,
    agencyTimezone(ctx.env),
  );

  if (!result.ok) {
    if (result.needsStaff) {
      return Response.json({ error: "needs_staff", days: [] }, { status: 422 });
    }
    if (isCalendarNotFound(result.status, result.body)) {
      return Response.json({ error: "calendar_not_found", days: [] }, { status: 422 });
    }
    console.error("[cold-call/slots] free-slots failed", result.status, result.body);
    return Response.json({ error: "slots_unavailable", days: [] }, { status: 502 });
  }

  return Response.json({ days: result.days, timezone: agencyTimezone(ctx.env) });
};
