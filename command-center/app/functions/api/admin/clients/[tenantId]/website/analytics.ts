import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { parseServiceAccount, batchRunReports, type ReportResponse } from "../../../../../lib/ga4";
import {
  shapeAnalytics,
  monthAnchors,
  ANALYTICS_REPORTS,
  NOT_CONNECTED_ANALYTICS,
  type WebsiteAnalytics,
} from "../../../../../api/website/analytics";

// Admin-tenant mirror of GET /api/website/analytics for the Fulfillment cockpit
// (Web Design > Analytics). The client endpoint resolves the tenant from the
// session; here the admin supplies the tenantId in the path. Same GA4 batch,
// same shaping, same not-connected shape, same per-property KV cache key, so the
// admin view and the client's own Insights read identical real numbers. Auth is
// enforced upstream in _middleware.ts (admin session only); do not re-check.
//
// GET /api/admin/clients/:tenantId/website/analytics -> WebsiteAnalytics

const CACHE_TTL_S = 15 * 60;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const propertyId = (tenant.ga4_property_id || ctx.env.GA4_PROPERTY_ID)?.trim();
  const sa = parseServiceAccount(ctx.env.GA4_SA_JSON);
  if (!propertyId || !sa) return Response.json(NOT_CONNECTED_ANALYTICS);

  const now = new Date();
  const { monthStart } = monthAnchors(now);
  // Keyed by property (not tenant), so the admin view and the client's own
  // Insights share one warm cache entry safely.
  const cacheKey = `ga4:${propertyId}:${monthStart}`;

  if (ctx.env.KV_CACHE) {
    const hit = await ctx.env.KV_CACHE.get(cacheKey, "json").catch(() => null);
    if (hit) return Response.json(hit as WebsiteAnalytics);
  }

  let reports: ReportResponse[];
  try {
    reports = await batchRunReports(sa, propertyId, ANALYTICS_REPORTS(now));
  } catch {
    return Response.json(NOT_CONNECTED_ANALYTICS);
  }

  const data = shapeAnalytics(reports, now);
  if (ctx.env.KV_CACHE) {
    await ctx.env.KV_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL_S }).catch(
      () => {},
    );
  }
  return Response.json(data);
};
