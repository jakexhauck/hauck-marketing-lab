import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { appMinter, resolveTenantGhl } from "../../../lib/ghlCreds";
import { syncTenantTouches, type SyncBudget } from "../../../lib/leadPickupSync";
import { remindCallBacks } from "../../../lib/leadCallBacks";

// Read every client's calls and inbound texts and decide the pickups, and tag
// the call-backs that have come due (lib/leadCallBacks.ts).
//
// POST /api/admin/ads/pickups              -> every estimate-model client, least recently synced first
// POST /api/admin/ads/pickups?tenantId=X   -> just that one
//
// Auth is enforced upstream in _middleware.ts: an admin session, or the shared
// scheduler secret (lib/adsCron.ts). Called by workers/ads-cron every run.
//
// One request may only make so many outbound calls, so the run shares one
// budget across clients and stops when it is spent. Clients are taken in order
// of how long ago they were last synced, so whoever was cut off this time goes
// first next time. Replaying the request is harmless: inserts ignore messages
// already stored and a decided call is never decided again.

// Under Cloudflare's 50-per-request cap, with room for the tenant read and the
// GHL key mints.
const RUN_BUDGET = 40;

interface TenantRow {
  id: string;
  name?: string | null;
  ghl_token?: string | null;
  ghl_location_id?: string | null;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const onlyTenant = new URL(ctx.request.url).searchParams.get("tenantId");
  // Only clients on the estimate model (tenants.estimate_tracking, 0153). The
  // rest still count pickups off the stage, so reading their calls would spend
  // Claude and the subrequest budget on numbers nobody shows.
  let query = client
    .from("tenants")
    .select("id, name, ghl_token, ghl_location_id")
    .eq("estimate_tracking", true);
  if (onlyTenant) query = query.eq("id", onlyTenant);
  const [{ data, error }, { data: syncRows }] = await Promise.all([
    query,
    client.from("lead_touch_sync").select("tenant_id, updated_at"),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const lastSync = new Map(
    ((syncRows ?? []) as { tenant_id: string; updated_at: string }[]).map((r) => [r.tenant_id, r.updated_at]),
  );
  const tenants = ((data ?? []) as TenantRow[]).sort((a, b) =>
    (lastSync.get(a.id) ?? "").localeCompare(lastSync.get(b.id) ?? ""),
  );

  const budget: SyncBudget = { calls: RUN_BUDGET };
  const results: Record<string, unknown>[] = [];
  for (const tenant of tenants) {
    const name = tenant.name ?? tenant.id;
    if (budget.calls < 8) {
      results.push({ name, skipped: "budget" });
      continue;
    }
    budget.calls -= 1;
    const creds = await resolveTenantGhl(tenant as never, appMinter(client, ctx.env));
    if (!creds) {
      results.push({ name, skipped: "crm not connected" });
      continue;
    }
    try {
      // Reminders first: they are time-sensitive, a pickup verdict is not.
      const remindedCallBacks = await remindCallBacks(client, tenant.id, creds, budget);
      const r = await syncTenantTouches(ctx.env, client, tenant.id, creds, budget);
      results.push({ name, remindedCallBacks, ...r });
    } catch (err) {
      // One client's broken export must not stop the rest.
      results.push({ name, error: String(err).slice(0, 200) });
    }
  }

  return Response.json({ results });
};
