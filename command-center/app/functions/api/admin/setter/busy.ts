import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { composioUserId, getConnection, getBusy } from "../../../lib/googleCalendar";

// GET /api/admin/setter/busy?tenantId=&start=&end= (admin-only, gated in
// _middleware.ts). A client's Google Calendar busy hours, so the Setter Suite
// Calendar tab can grey out time the client has already committed elsewhere.
// Availability only: no titles, no attendees, no detail of any kind is
// requested or returned, exactly as on the client-facing route.
//
// The client app has functions/api/calendar/busy.ts, but it resolves the
// Composio user id from ctx.data.tenant, which admin requests never have:
// admin returns early in _middleware.ts before tenant resolution runs.
//
// getBusy's second argument is NOT a tenant UUID. It is a Composio user id,
// `${mode}:${slug}` (functions/lib/googleCalendar.ts:38). mode is not a
// tenants column: it belongs to the client-app session. getGhlContextForTenant
// reconstructs it onto the context, which is why this route reads gctx.slug
// and gctx.mode rather than looking anything up itself.
//
// This route never returns 502. getConnection and getBusy both swallow their
// failures by design (an absent link, an expired grant, a Composio throttle),
// and a client who has not linked a calendar is a normal state, not an error.
// `connected` is what tells "linked, nothing busy" apart from "not linked" in
// the UI, and it is the only thing a 502 here would otherwise be saying.
//
// Timezone is the env-level tenantTimezone, matching ./slots. The client route
// takes the viewer's zone off the query string instead; a setter is not in the
// client's timezone, so the browser is the wrong source here. That leaves this
// route sharing the Suite's existing single-timezone limitation rather than
// adding a second, different one.

export interface BusyQuery {
  tenantId: string;
  timeMin: string;
  timeMax: string;
}

export type ParsedBusyQuery =
  | { ok: true; query: BusyQuery }
  | { ok: false; code: string };

// Pure: validate + normalize the query params. Unlike ./slots and the events
// route there is no numeric coercion at all, because getBusy forwards these
// straight to GOOGLECALENDAR_FIND_FREE_SLOTS, which wants ISO-8601 strings.
// Unit-testable without a request.
export function parseBusyQuery(params: URLSearchParams): ParsedBusyQuery {
  const tenantId = params.get("tenantId");
  if (!tenantId || !tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !start.trim() || !end || !end.trim()) {
    return { ok: false, code: "missing_range" };
  }
  return {
    ok: true,
    query: { tenantId: tenantId.trim(), timeMin: start.trim(), timeMax: end.trim() },
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const parsed = parseBusyQuery(url.searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
  const { tenantId, timeMin, timeMax } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const userId = composioUserId({ slug: gctx.slug, mode: gctx.mode });

    const conn = await getConnection(ctx.env, userId);
    if (!conn.connected) {
      // Not an error. Most clients will not have linked anything, and the grid
      // must render exactly as it does without this feature.
      return Response.json({ connected: false, busy: [] });
    }

    const busy = await getBusy(ctx.env, userId, {
      timeMin,
      timeMax,
      timezone: tenantTimezone(ctx.env),
    });
    return Response.json(
      { connected: true, busy },
      {
        // Short private cache, same as the client route: busy time is not
        // urgent, and Composio's managed auth shares a rate-limit quota across
        // all of its customers, so this shields the quota from a setter
        // flipping between weeks.
        headers: { "Cache-Control": "private, max-age=60" },
      },
    );
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
