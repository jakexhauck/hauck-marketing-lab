import { tenantTimezone, type Env, type ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../../lib/tenantResolve";
import { resolveAdAccount } from "../../../../../lib/metaGraph";
import {
  buildAdsInsights,
  EMPTY_TOTALS,
  type AdsContext,
  type AdsInsightsResponse,
} from "../../../../../lib/adsCore";
import { resolveMetaToken } from "../../../../../lib/metaToken";

// Admin-tenant mirror of GET /api/ads/insights for the Fulfillment cockpit
// (Paid Ads > Campaigns/Data). The client endpoint resolves the tenant from the
// session; here the admin supplies the tenantId in the path. Same Meta account
// resolution, same GHL revenue join, same not-connected shape, same shared
// adsCore.buildAdsInsights, so the admin view and the client's own Overview
// read identical real numbers. Auth is enforced upstream in _middleware.ts
// (admin session only); do not re-check here.
//
// GET /api/admin/clients/:tenantId/ads/insights -> AdsInsightsResponse

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const token = await resolveMetaToken(ctx.env);
  // No env-account fallback on the admin surface. The client endpoints use
  // META_AD_ACCOUNT_ID as a single-tenant fallback, but the admin cockpit is
  // multi-tenant: falling back here would render the fallback account's real
  // spend/leads under any tenant that has no meta_ad_account_id, mislabeling one
  // client's data as another and hiding the honest not-connected state. So a
  // tenant with no account of its own is correctly treated as not connected.
  let account = resolveAdAccount(tenant.meta_ad_account_id ?? undefined, undefined);
  if (!token || !account) {
    // Full empty shape (not a bare { configured: false }), matching the client
    // endpoint byte-for-byte, so no Paid Ads tab can crash on a missing field
    // before Meta is wired for this tenant.
    return Response.json({
      configured: false,
      currency: "USD",
      totals: EMPTY_TOTALS,
      lastMonthLeads: 0,
      weekly: [],
      sources: { fb: 0, ig: 0 },
      ads: [],
      phase: null,
    } satisfies AdsInsightsResponse);
  }
  if (!account.startsWith("act_")) account = `act_${account}`;

  // Resolve GHL creds the same way the live middleware does for the client
  // path (tenant's own creds once real, else the GHL_* env fallback). Reading
  // tenant.ghl_token raw here would send a placeholder ('env'/'pending') into
  // the revenue join and fail it silently for any client not yet fully wired.
  const creds = resolveGhlCreds(tenant);

  const zone = tenantTimezone(ctx.env);
  const adsCtx: AdsContext = {
    metaAccount: account,
    ghlToken: creds?.token ?? "",
    ghlLocationId: creds?.locationId ?? "-",
    zone,
  };
  return Response.json(await buildAdsInsights(ctx.env, adsCtx));
};
