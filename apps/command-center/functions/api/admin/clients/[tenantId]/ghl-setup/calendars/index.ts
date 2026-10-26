import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { shapeCalendars } from "../../../../../../lib/ghlSetup";
import { fail, loc, setupCtx, staffOf } from "../_shared";

// GET /api/admin/clients/:tenantId/ghl-setup/calendars -> { calendars, users }
//
// Client > GHL > Calendars (checklist B5), with the sub-account's users so team
// members show as names and the owner can be picked.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    const [raw, staff] = await Promise.all([ghlJson<unknown>(s.g, `/calendars/?locationId=${loc(s.g)}`), staffOf(s)]);
    return Response.json({ calendars: shapeCalendars(raw), users: staff.users }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};
