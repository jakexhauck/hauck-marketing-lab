import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { resolveMetaToken } from "../../../../../lib/metaToken";
import { loadAdsStatus } from "../../../../../lib/adsStatus";

// GET /api/admin/clients/:tenantId/ads/status -> AdsStatus
//
// The same launch + Meta-verification answer the client's own Paid Ads pages
// get, for the cockpit. Auth is enforced upstream in _middleware.ts (admin
// session only). Refreshes a stale client exactly as a client page view does.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenant, error } = await client
    .from("tenants")
    .select("id, name, meta_ad_account_id, meta_timezone")
    .eq("id", ctx.params.tenantId as string)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  try {
    const token = await resolveMetaToken(ctx.env);
    return Response.json(await loadAdsStatus(client, tenant, token));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
