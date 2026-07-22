import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getFreeSlots, isCalendarNotFound } from "../../lib/appointments";

// GET /api/admin/setter/slots?tenantId=&calendarId=&days= (admin-only,
// gated in _middleware.ts). Live free-slot lookup for the booking panel: a
// setter who has someone on the phone picks a calendar and sees real open
// windows before offering a time. Read-only, so unlike book.ts this is safe
// to hit repeatedly while the setter narrows down a slot.
//
// Takes a calendarId, not a name. It used to resolve a typed name through
// resolveCalendarByName; the picker now selects from the real list served by
// ./calendars, so that lookup was a lossy round trip (two calendars sharing a
// word, a rename mid-call) with an extra CRM call attached. Ids still never
// get hardcoded: they come from that endpoint, per tenant.
//
// Reuses getFreeSlots from ../../lib/appointments unchanged, including the
// calendars API's Version 2021-04-15 quirk baked into that file's local
// calFetch.
//
// Degrades honestly: a round-robin calendar with no team members assigned
// 422s "no team members" at the CRM; that is surfaced here as
// needsStaff:true so the setter sees a plain "this calendar has no staff
// assigned" message rather than an empty grid that reads as "nobody
// available today". Those are different problems with different fixes.

export interface ValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

export interface SlotsQuery {
  tenantId: string;
  calendarId: string;
  days: number;
}

export type ParsedSlotsQuery =
  | { ok: true; query: SlotsQuery }
  | { ok: false; code: string };

// Pure: validate + normalize the query params, including clamping days into
// [1, 31] the same way the client-facing /api/appointments/slots does.
// Unit-testable without a request.
export function parseSlotsQuery(params: URLSearchParams): ParsedSlotsQuery {
  const tenantId = params.get("tenantId");
  if (!tenantId || !tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  const calendarId = params.get("calendarId");
  if (!calendarId || !calendarId.trim()) {
    return { ok: false, code: "missing_calendar_id" };
  }
  const days = Math.min(Math.max(Number(params.get("days")) || 14, 1), 31);
  return {
    ok: true,
    query: { tenantId: tenantId.trim(), calendarId: calendarId.trim(), days },
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const parsed = parseSlotsQuery(url.searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
  const { tenantId, calendarId, days } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    const now = Date.now();
    const endMs = now + days * 24 * 60 * 60_000;
    const timezone = tenantTimezone(ctx.env);

    const result = await getFreeSlots(gctx, calendarId, now, endMs, timezone);
    if (!result.ok) {
      if (result.needsStaff) {
        return Response.json({ error: "needs_staff" }, { status: 422 });
      }
      // The id came from ./calendars, so a rejection here means it went stale
      // (deleted or deactivated mid-session). Kept as its own response so the
      // setter is told to reselect a calendar rather than shown a CRM error.
      if (isCalendarNotFound(result.status, result.body)) {
        return Response.json(
          { error: "calendar_not_found", calendar: calendarId },
          { status: 422 },
        );
      }
      return Response.json(
        { error: "ghl_error", status: result.status, body: result.body },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, timezone, days: result.days });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
