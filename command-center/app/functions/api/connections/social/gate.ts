import type { Env, ApiData } from "../../../lib/env";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { composioUserId, getConnection } from "../../../lib/googleCalendar";

// GET /api/connections/social/gate -> { blocked, calendar, calendarRequired, reason }
//
// The single question the blocking gate asks: may this client use the app yet?
//
// Calendar-only since 2026-09-22 (Jake). Facebook and Instagram used to be asked
// of the client here, connected through GHL's Social Planner. Jake wants them
// under Settings > Integrations instead, which GHL refuses to any outside token
// (401 "not authorized for this scope"), so the agency connects them on the
// onboarding call and the client is only asked for what they can do themselves.
//
// Computed on the SERVER so the browser is never trusted with the answer.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;

  const open = (reason: string) =>
    Response.json({ blocked: false, calendar: false, calendarRequired: false, reason });

  // A client whose GHL is not wired yet is held by SetupHoldingScreen before it
  // ever reaches this gate; answering open keeps the two from stacking.
  if (isPlaceholder(t.ghl_location_id) || isPlaceholder(t.ghl_token)) {
    return open("not_configured");
  }

  // Optional since 2026-10-08 (Jake): no client is held for a Google Calendar.
  // Bookings live in the app now (0150), so the app works without one; the
  // owner can still connect it under Settings > Integrations. The
  // calendar_gate_waived column stays, unread, so this is a one-line revert.
  const calendarRequired = false;
  if (!calendarRequired) return open("not_required");

  // A failed read comes back as "not connected", which holds the gate shut
  // rather than letting somebody through on an error.
  const conn = await getConnection(ctx.env, composioUserId({ slug: t.slug, mode: t.mode }));

  return Response.json({
    blocked: !conn.connected,
    calendar: conn.connected,
    calendarRequired,
    reason: conn.connected ? "connected" : "missing",
  });
};
