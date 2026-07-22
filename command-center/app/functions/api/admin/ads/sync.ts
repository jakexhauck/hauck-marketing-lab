import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { resolveAdAccount } from "../../../lib/metaGraph";
import { buildAdDayUpserts, fetchAdDays } from "../../../lib/metaAdDays";

// Refresh the per-ad, per-day Meta spend snapshot that backs the Ad Tracker.
// Replaces the Make scenario "AC: (Local Ads School) Client Meta Data Feed".
//
// POST /api/admin/ads/sync            -> every tenant with an ad account
// POST /api/admin/ads/sync?tenantId=X -> just that one
// POST /api/admin/ads/sync?days=30    -> widen the trailing window
//
// Auth is enforced upstream in _middleware.ts (admin session only).
//
// SCHEDULING: Cloudflare Pages has no cron trigger, and this repo has no
// scheduler of any kind yet, so nothing calls this automatically. It is safe to
// call as often as you like: the (tenant_id, date, ad_id) upsert makes a re-run
// a no-op, which is the whole reason it was built this way rather than
// appending like Make did. Wiring a nightly trigger is a config change, not a
// code change.

const DEFAULT_DAYS = 7;
// Chunked so a client with many ads does not exceed the statement size.
const CHUNK = 500;

interface TenantRow {
  id: string;
  name?: string | null;
  meta_ad_account_id?: string | null;
}

interface SyncResult {
  tenantId: string;
  name: string;
  rows?: number;
  skipped?: string;
  error?: string;
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

  let rows;
  try {
    rows = await fetchAdDays(token, account, days);
  } catch (err) {
    // One client's broken ad account must not abort the others.
    return { tenantId: tenant.id, name, error: String(err).slice(0, 200) };
  }

  const upserts = buildAdDayUpserts(rows, tenant.id);
  if (upserts.length === 0) return { tenantId: tenant.id, name, rows: 0 };

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await client!
      .from("meta_ad_days")
      .upsert(chunk, { onConflict: "tenant_id,date,ad_id" });
    if (error) return { tenantId: tenant.id, name, error: error.message };
  }

  return { tenantId: tenant.id, name, rows: upserts.length };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  if (!token) return Response.json({ error: "meta not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const onlyTenant = url.searchParams.get("tenantId");
  const days = Number(url.searchParams.get("days")) || DEFAULT_DAYS;

  let query = client.from("tenants").select("id, name, meta_ad_account_id");
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
      await syncTenant(client, tenant, token, ctx.env.META_AD_ACCOUNT_ID, days),
    );
  }

  const synced = results.reduce((sum, r) => sum + (r.rows ?? 0), 0);
  await logAdminAction(client, ctx.data.admin!.id, "ads.metaAdDays.sync", onlyTenant, {
    days,
    tenants: results.length,
    rows: synced,
    failed: results.filter((r) => r.error).length,
  });

  return Response.json({ days, rows: synced, results });
};
