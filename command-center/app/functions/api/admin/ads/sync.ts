import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { describeMismatches, syncAndVerifyTenant, type SyncResult, type SyncTenantRow } from "../../../lib/metaSync";
import { resolveMetaToken } from "../../../lib/metaToken";
import { bumpCronHeartbeat } from "../../../lib/cronHeartbeat";
import { logError } from "../../../lib/errorLog";

// Refresh the per-ad, per-day Meta spend snapshot that backs the Ad Tracker.
// Replaces the Make scenario "AC: (Local Ads School) Client Meta Data Feed".
//
// POST /api/admin/ads/sync            -> every tenant with an ad account
// POST /api/admin/ads/sync?tenantId=X -> just that one
// POST /api/admin/ads/sync?days=30    -> widen the trailing window
//
// Auth is enforced upstream in _middleware.ts (admin session only).
//
// SCHEDULING: Cloudflare Pages has no cron trigger, so the nightly run lives in
// a separate Worker (workers/ads-cron) that calls this route with a shared
// secret. That path is gated in _middleware.ts via lib/adsCron.ts and carries no
// admin session, which is why the audit write below is conditional. It is safe
// to call as often as you like: the (tenant_id, date, ad_id) upsert makes a
// re-run a no-op, which is the whole reason it was built this way rather than
// appending like Make did.
//
// Every run ends by proving each client's WHOLE stored history against Meta's
// own daily account totals and re-pulling any day that disagrees (see
// lib/metaSync.ts and lib/metaReconcile.ts). A client still off after that is
// logged to error_log, which the health probe alarms on.

const DEFAULT_DAYS = 7;
// Past this the reconciler is the right tool: it already re-pulls exactly the
// days that are wrong, however old.
const MAX_DAYS = 90;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "meta not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const onlyTenant = url.searchParams.get("tenantId");
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(url.searchParams.get("days")) || DEFAULT_DAYS)));

  let query = client.from("tenants").select("id, name, meta_ad_account_id, meta_timezone");
  if (onlyTenant) query = query.eq("id", onlyTenant);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (data ?? []) as SyncTenantRow[];
  if (tenants.length === 0) {
    return Response.json({ error: "no matching client" }, { status: 404 });
  }

  const results: SyncResult[] = [];
  for (const tenant of tenants) {
    results.push(await syncAndVerifyTenant(client, token, tenant, days));
  }

  const synced = results.reduce((sum, r) => sum + (r.rows ?? 0), 0);
  const failed = results.filter((r) => r.error || r.verified === false).length;

  // Per-client failures become receipts, not console noise: the admin errors
  // surface and the health probe both read error_log.
  for (const r of results) {
    if (r.error) {
      await logError(ctx.env, "ads-sync", `Client "${r.name}" failed: ${r.error}`, {
        tenantId: r.tenantId,
      });
    } else if (r.verified === false) {
      // Synced, re-pulled the bad days, and STILL disagrees with Meta. The one
      // outcome that means a client may be looking at a wrong number.
      await logError(
        ctx.env,
        "ads-sync",
        `Client "${r.name}" does not match Meta: ${describeMismatches(r.mismatches ?? [])}`,
        { tenantId: r.tenantId },
      );
    }
  }

  // Receipt for the watchdog: the nightly spend snapshot going silent is how
  // ROAS quietly goes stale. The probe fails this heartbeat after one
  // missed night and the existing health-diff push makes it loud.
  //
  // Only a run over EVERY client counts. On 2026-09-21 a one-client manual run
  // at 19:00 bumped this, so the 06:00 run that never happened the next
  // morning raised nothing: the heartbeat said "fresh" about a job that had
  // not run.
  if (!onlyTenant) {
    await bumpCronHeartbeat(
      client,
      "ads-sync",
      `${results.length} client${results.length === 1 ? "" : "s"}, ${synced} rows, ${failed} failed`,
    );
  }

  // The scheduler reaches this handler without an admin session (see the
  // SCHEDULING note above), so there is no admin id to attribute the row to.
  // Log to the console instead of inventing an actor: an audit trail that names
  // the wrong person is worse than one that says "the cron did it".
  const admin = ctx.data.admin;
  if (admin) {
    await logAdminAction(client, admin.id, "ads.metaAdDays.sync", onlyTenant, {
      days,
      tenants: results.length,
      rows: synced,
      failed,
    });
  } else {
    console.log(
      `[ads/sync] scheduled run: ${results.length} clients, ${synced} rows, ${failed} failed`,
    );
  }

  return Response.json({ days, rows: synced, results });
};
