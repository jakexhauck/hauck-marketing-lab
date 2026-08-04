import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../../lib/tenantResolve";
import type { GhlContext } from "../../../../../lib/ghl";
import { fetchPaidAdsLeads } from "../../../../../lib/paidAdsPipeline";

// Admin-tenant mirror of GET /api/ads/leads for the Fulfillment cockpit
// (Paid Ads > Data & Leads). Same by-name pipeline resolution, same shaping,
// same shared paidAdsPipeline.fetchPaidAdsLeads core as the client endpoint,
// so the admin view reads the tenant's real Paid Ad's Pipeline. Auth is
// enforced upstream in _middleware.ts (admin session only); do not re-check.
//
// GET /api/admin/clients/:tenantId/ads/leads -> { leads, total, configError? }

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  // Resolve GHL creds the same way the live middleware does for the client
  // path. Reading tenant.ghl_token raw would send a placeholder
  // ('env'/'pending') straight to GHL and 401 for any client not yet fully
  // wired (the same bug the Website Pages admin endpoint guards against).
  const creds = resolveGhlCreds(tenant);
  if (!creds) return Response.json({ leads: [], total: 0 });

  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };
  const result = await fetchPaidAdsLeads(gctx);
  return Response.json(result);
};
