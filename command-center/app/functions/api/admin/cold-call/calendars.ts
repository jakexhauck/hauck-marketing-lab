import type { Env, ApiData } from "../../../lib/env";
import { getAgencyGhlContext, AgencyGhlError } from "../../../lib/agencyGhl";
import { listCalendars } from "../../lib/appointments";
import { pickColdCallCalendars } from "../../../lib/coldCallCalendar";

// GET /api/admin/cold-call/calendars  (admin session gated in _middleware.ts,
// role gated in lib/adminRoles).
//
// The agency's own calendars, read live so the booking panel works from real
// ids rather than anything hardcoded, then narrowed to the cold call one.
//
// The narrowing is the point. The panel used to receive all three and default to
// a demo calendar; a caller could still pick Onboarding out of the list, and a
// default nobody is stopped from overriding is not a rule. Enforced here rather
// than only in the browser, because the list is what the panel books from.
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

  const calendars = pickColdCallCalendars(await listCalendars(gctx));
  return Response.json({
    configured: true,
    calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
  });
};
