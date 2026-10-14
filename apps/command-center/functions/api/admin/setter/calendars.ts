import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { listCalendars, type Calendar } from "../../lib/appointments";

// GET /api/admin/setter/calendars?tenantId= (admin-only, gated in
// _middleware.ts). Every ACTIVE calendar on the client's sub-account, so the
// booking panel can offer a real dropdown instead of asking a setter to type
// a calendar name and hope it matches.
//
// Creds come from getGhlContextForTenant: this is a cross-client admin
// surface, and that helper throws on a half-configured client rather than
// resolving to anything. Listing another client's calendars here would end with
// a setter booking a stranger's customer into the wrong account.
//
// Unfiltered beyond active: an admin working the account should see whatever
// the CRM has. Only event-type calendars support free slots, so a calendar
// that cannot be booked surfaces through the existing needsStaff/ghl_error
// path in slots.ts rather than being silently hidden here.

export interface ApiSetterCalendar {
  id: string;
  name: string;
  isActive: boolean;
}

// Pure: the wire shape has both fields optional. Normalize to the contract the
// UI consumes, keeping "absent isActive means active" identical to the filter
// listCalendars applies.
export function shapeSetterCalendar(c: Calendar): ApiSetterCalendar {
  return { id: c.id, name: c.name ?? "", isActive: c.isActive !== false };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  if (!tenantId || !tenantId.trim()) {
    return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  }

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId.trim());
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  // Separate try: only a CRM failure becomes 502. Folding the creds lookup in
  // would turn a misconfigured tenant into "the CRM is down", which sends the
  // admin looking in the wrong place.
  try {
    const calendars = (await listCalendars(gctx)).map(shapeSetterCalendar);
    return Response.json({ calendars });
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};
