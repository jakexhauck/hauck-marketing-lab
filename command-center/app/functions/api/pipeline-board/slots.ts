import type { Env, ApiData } from "../../lib/env";
import { tenantTimezone } from "../../lib/env";
import type { GhlContext } from "../../lib/ghl";
import { getServiceClient } from "../../lib/supabase";
import { getFreeSlots } from "../lib/appointments";
import { calendarFor } from "../../lib/boardBooking";
import { loadTenantForBoard } from "../../lib/leadBoardStore";

// GET /api/pipeline-board/slots?cal=estimate|job
//
// The open times on the client's GHL "Home Estimate" or "Job" calendar, for
// the board's booking picker. Same three weeks the outcome page offers.

const DAYS_AHEAD = 21;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const kind = new URL(ctx.request.url).searchParams.get("cal") === "job" ? "job" : "estimate";
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const tenant = await loadTenantForBoard(client, t.slug, tenantTimezone(ctx.env));
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const cal = await calendarFor(gctx, kind);
  if (!cal) {
    return Response.json({ days: [], error: `No ${kind === "job" ? "Job" : "Estimate"} calendar in this account.` });
  }
  const now = Date.now();
  const result = await getFreeSlots(gctx, cal.id, now, now + DAYS_AHEAD * 86_400_000, tenant.zone);
  if (!result.ok) {
    const error = result.needsStaff ? "That calendar has no team member on it." : "Could not load times.";
    return Response.json({ days: [], error }, { status: result.needsStaff ? 200 : 502 });
  }
  return Response.json({ days: result.days, zone: tenant.zone }, { headers: { "cache-control": "no-store" } });
};
