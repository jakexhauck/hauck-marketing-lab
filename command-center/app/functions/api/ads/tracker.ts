import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import type { GhlContext } from "../../lib/ghl";
import { buildTrackerResponse, parseTrackerParams } from "../../lib/adsTrackerResponse";

// GET /api/ads/tracker?range=all|7|30|90&level=campaign|adset|ad
//   -> { range, level, kpis, breakdown, unattributed, leads, currency, meta }
//
// The sheet's Dashboard tab (RESULTS + BREAKDOWN) and Lead Tracker tab, served
// as one payload, scoped to the SESSION tenant.
//
// The payload itself is built in lib/adsTrackerResponse.ts, which the admin
// cockpit's route calls too. This file's only job is to say which tenant.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const params = parseTrackerParams(new URL(ctx.request.url));
  if ("error" in params) return Response.json({ error: params.error }, { status: 400 });

  const tenantId = await resolveTenantId(client, t.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  try {
    const body = await buildTrackerResponse({
      client,
      gctx,
      tenantId,
      internalRecipients: t.internal_recipients ?? null,
      range: params.range,
      level: params.level,
      manualStatus: t.manual_lead_status === true,
    });
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
