import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { buildAdsMedia } from "../../../../../lib/adsMedia";

// Admin-tenant mirror of GET /api/ads/media for the Fulfillment cockpit
// (Paid Ads > Ad Library). Same shared System-User token, same per-tenant
// account resolution, same shared adsMedia.buildAdsMedia core as the client
// endpoint, so the admin view reads the client's real media library. Auth is
// enforced upstream in _middleware.ts (admin session only); do not re-check.
//
// GET /api/admin/clients/:tenantId/ads/media -> AdsMediaResponse

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const result = await buildAdsMedia(
    ctx.env.META_SYSTEM_USER_TOKEN,
    tenant.meta_ad_account_id,
    ctx.env.META_AD_ACCOUNT_ID,
  );
  return Response.json(result);
};
