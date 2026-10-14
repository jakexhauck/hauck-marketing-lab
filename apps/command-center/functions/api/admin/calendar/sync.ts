import type { Env } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isPlaceholder } from "../../../lib/tenantGhl";
import { syncTenantCalendar, type SyncResult } from "../../../lib/calendarSync";
import { bumpCronHeartbeat } from "../../../lib/cronHeartbeat";

// POST /api/admin/calendar/sync            every eligible client
// POST /api/admin/calendar/sync?tenantId=  one client
//
// Pushes each client's real Google commitments into the calendar their
// customers book into, so a slot they are not free for is never offered.
//
// Two callers, both legitimate:
//   - the cron worker every 15 minutes, holding CALENDAR_CRON_SECRET
//     (gated in _middleware.ts via lib/calendarCron.ts, no admin session)
//   - an admin, from the Connection panel, to force a run and see the result
//
// Reads NO request body. Its only input is the client's own Google Calendar, so
// replaying a captured request re-runs the same diff and converges on the same
// state rather than duplicating blocks.

interface TenantRow {
  id: string;
  slug: string;
  ghl_location_id: string;
  ghl_token: string;
  estimate_calendar_id: string | null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const only = new URL(ctx.request.url).searchParams.get("tenantId");

  let query = client
    .from("tenants")
    .select("id, slug, ghl_location_id, ghl_token, estimate_calendar_id");
  if (only) query = query.eq("id", only);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (data ?? []) as TenantRow[];
  const results: SyncResult[] = [];

  for (const tenant of tenants) {
    // A client whose GHL is not wired has nothing to block. Reading the token
    // raw would send a placeholder ('env'/'pending') to GHL and 401 for every
    // client the agency has not finished standing up.
    if (isPlaceholder(tenant.ghl_location_id) || isPlaceholder(tenant.ghl_token)) {
      results.push({
        tenantId: tenant.id,
        status: "not_connected",
        created: 0,
        updated: 0,
        removed: 0,
        detail: "crm not wired",
      });
      continue;
    }

    try {
      // Live mode only. A client's test workspace linking a calendar must never
      // write blocks into the real sub-account they sell from; composioUserId
      // keys the grant by mode for exactly this reason.
      results.push(await syncTenantCalendar(ctx.env, client, tenant, "live"));
    } catch (err) {
      // One client's bad day must not stop the other clients syncing.
      console.error("[calendar-sync] tenant failed", tenant.slug, err);
      results.push({
        tenantId: tenant.id,
        status: "error",
        created: 0,
        updated: 0,
        removed: 0,
        detail: (err as Error).message,
      });
    }
  }

  // Receipt for the watchdog: the probe judges freshness off this heartbeat,
  // and a stopped worker surfaces as a failed health check (and pushes).
  const errors = results.filter((r) => r.status === "error").length;
  await bumpCronHeartbeat(
    client,
    "calendar-sync",
    `${results.length} client${results.length === 1 ? "" : "s"}, ${errors} error${errors === 1 ? "" : "s"}`,
  );

  return Response.json({
    ran: results.length,
    created: results.reduce((n, r) => n + r.created, 0),
    updated: results.reduce((n, r) => n + r.updated, 0),
    removed: results.reduce((n, r) => n + r.removed, 0),
    results,
  });
};
