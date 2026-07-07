import type { Env, ApiData } from "../../../lib/env";
import type { GhlContext } from "../../../lib/ghl";
import { fetchPaidAdsLeads, type ApiAdLead } from "../../../lib/paidAdsPipeline";

// Re-exported so existing importers can keep reading ApiAdLead from
// "./leads/index"; the real shaping now lives in ../../../lib/paidAdsPipeline,
// shared with the admin Fulfillment cockpit's per-tenant Data & Leads view.
export type { ApiAdLead };

// GET /api/ads/leads: thin wrapper for the client's own Paid Ads "Data &
// Leads" tab. Resolves the session-derived tenant's GHL context, then hands
// off to the shared paidAdsPipeline.fetchPaidAdsLeads core.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const result = await fetchPaidAdsLeads(gctx);
  return Response.json(result);
};
