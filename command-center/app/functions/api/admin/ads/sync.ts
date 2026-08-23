import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { resolveAdAccount } from "../../../lib/metaGraph";
import { buildAdDayUpserts, fetchAccountTimezone, fetchAdDays } from "../../../lib/metaAdDays";
import { buildEntityUpserts, fetchAdEntities } from "../../../lib/metaAdEntities";
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

const DEFAULT_DAYS = 7;
// Chunked so a client with many ads does not exceed the statement size.
const CHUNK = 500;

interface TenantRow {
  id: string;
  name?: string | null;
  meta_ad_account_id?: string | null;
  meta_timezone?: string | null;
}

interface SyncResult {
  tenantId: string;
  name: string;
  rows?: number;
  // Campaigns + ad sets + ads whose structure and live status were refreshed.
  entities?: number;
  skipped?: string;
  error?: string;
}

// Refresh the account's structure: every campaign, ad set and ad, with the
// status Meta reports today. This is what lets the client breakdown scope
// itself to the live campaign and mark the ads actually running.
//
// Replaced whole rather than merged. A campaign deleted in Meta must disappear
// here too, or the page keeps filtering toward a campaign that no longer exists,
// and the client sees an empty breakdown with no explanation.
async function syncEntities(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  tenantId: string,
  token: string,
  account: string,
): Promise<number> {
  const entities = await fetchAdEntities(token, account);
  const upserts = buildEntityUpserts(entities, tenantId);
  if (upserts.length === 0) return 0;

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await client
      .from("meta_ad_entities")
      .upsert(chunk, { onConflict: "tenant_id,entity_id" });
    if (error) throw new Error(error.message);
  }

  // Anything not in this pull no longer exists in the account. Deleting by
  // "older than this run" rather than by id list keeps the statement small
  // however many ads the client has.
  const { error: pruneError } = await client
    .from("meta_ad_entities")
    .delete()
    .eq("tenant_id", tenantId)
    .lt("updated_at", now);
  if (pruneError) throw new Error(pruneError.message);

  return upserts.length;
}

async function syncTenant(
  client: ReturnType<typeof getServiceClient>,
  tenant: TenantRow,
  token: string,
  envAccount: string | undefined,
  days: number,
): Promise<SyncResult> {
  const name = tenant.name ?? tenant.id;
  const account = resolveAdAccount(tenant.meta_ad_account_id ?? undefined, envAccount);
  if (!account) return { tenantId: tenant.id, name, skipped: "no ad account" };

  // The account's reporting timezone, FIRST, because the insights window below
  // is a calendar range in that zone and asking for the wrong days is not a
  // recoverable error, just a quietly short answer. Falls back to whatever was
  // cached on the tenant, then to UTC.
  const fetchedZone = await fetchAccountTimezone(token, account);
  const zone = fetchedZone ?? tenant.meta_timezone ?? "UTC";
  if (fetchedZone && fetchedZone !== (tenant.meta_timezone ?? null)) {
    const { error: zoneError } = await client!
      .from("tenants")
      .update({ meta_timezone: fetchedZone })
      .eq("id", tenant.id);
    if (zoneError) console.warn(`[ads/sync] ${name}: timezone write failed`, zoneError.message);
  }

  let rows;
  let entities = 0;
  try {
    rows = await fetchAdDays(token, account, days, zone);
    // Structure and status, for the client breakdown's live-campaign scope.
    // Same try block: if Meta will not talk to us, neither half is trustworthy.
    entities = await syncEntities(client!, tenant.id, token, account);
  } catch (err) {
    // One client's broken ad account must not abort the others.
    return { tenantId: tenant.id, name, error: String(err).slice(0, 200) };
  }

  const upserts = buildAdDayUpserts(rows, tenant.id);
  if (upserts.length === 0) return { tenantId: tenant.id, name, rows: 0, entities };

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await client!
      .from("meta_ad_days")
      .upsert(chunk, { onConflict: "tenant_id,date,ad_id" });
    if (error) return { tenantId: tenant.id, name, error: error.message };
  }

  return { tenantId: tenant.id, name, rows: upserts.length, entities };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const token = await resolveMetaToken(ctx.env);
  if (!token) return Response.json({ error: "meta not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const onlyTenant = url.searchParams.get("tenantId");
  const days = Number(url.searchParams.get("days")) || DEFAULT_DAYS;

  let query = client.from("tenants").select("id, name, meta_ad_account_id, meta_timezone");
  if (onlyTenant) query = query.eq("id", onlyTenant);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (data ?? []) as TenantRow[];
  if (tenants.length === 0) {
    return Response.json({ error: "no matching client" }, { status: 404 });
  }

  const results: SyncResult[] = [];
  for (const tenant of tenants) {
    results.push(
      // No env account: a client with none of its own is skipped, rather than
      // having another client's spend synced into its tracker.
      await syncTenant(client, tenant, token, undefined, days),
    );
  }

  const synced = results.reduce((sum, r) => sum + (r.rows ?? 0), 0);
  const failed = results.filter((r) => r.error).length;

  // Per-client failures become receipts, not console noise: the admin errors
  // surface and the health probe both read error_log.
  for (const r of results) {
    if (r.error) {
      await logError(ctx.env, "ads-sync", `Client "${r.name}" failed: ${r.error}`, {
        tenantId: r.tenantId,
      });
    }
  }

  // Receipt for the watchdog: the nightly spend snapshot going silent is how
  // ROAS quietly goes stale. The probe fails this heartbeat after one
  // missed night and the existing health-diff push makes it loud.
  await bumpCronHeartbeat(
    client,
    "ads-sync",
    `${results.length} client${results.length === 1 ? "" : "s"}, ${synced} rows, ${failed} failed`,
  );

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
