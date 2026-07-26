import type { Env, ApiData } from "../../../lib/env";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { listCalendars } from "../../lib/appointments";

// GET /api/admin/cold-call/calendars  (admin session gated in _middleware.ts,
// role gated in lib/adminRoles).
//
// The agency's own calendars, so the booking panel offers real ones by id rather
// than anything hardcoded. A caller needs this to book; only an owner picks
// which calendar is the default, on the Settings page.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let gctx;
  try {
    gctx = getAgencyGhlContext(ctx.env);
  } catch (err) {
    if (err instanceof AgencyGhlError) {
      // Not an error state to shout about: the console simply has not been
      // connected to the agency's GHL yet, and the page says so.
      return Response.json({ configured: false, calendars: [] });
    }
    throw err;
  }

  const calendars = await listCalendars(gctx);
  return Response.json({
    configured: true,
    calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
  });
};
