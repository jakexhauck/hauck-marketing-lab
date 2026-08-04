import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../lib/tenantResolve";
import type { GhlContext } from "../../../../lib/ghl";
import { buildTrackerResponse, parseTrackerParams } from "../../../../lib/adsTrackerResponse";

// GET /api/admin/clients/:tenantId/ad-tracker?range=all|7|30|90&level=campaign|adset|ad
//   -> { range, level, kpis, breakdown, unattributed, leads, currency, meta }
//
// The SAME payload as the client's own /api/ads/tracker, for a client named in
// the URL rather than in the session. Auth is enforced upstream in
// _middleware.ts (admin session only).
//
// This route used to assemble a narrower payload by hand and never returned
// `leads`, which is why the cockpit could not render the client's own Lead
// Tracker. It now shares lib/adsTrackerResponse.ts with the client route, so
// the two cannot report different numbers for the same client.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const params = parseTrackerParams(new URL(ctx.request.url));
  if ("error" in params) return Response.json({ error: params.error }, { status: 400 });

  // Resolve creds the way the live middleware does. Reading tenant.ghl_token
  // raw would send a placeholder ('env'/'pending') to GHL and 401 for any
  // client not yet fully wired.
  const creds = resolveGhlCreds(tenant);
  if (!creds) return Response.json({ error: "crm not connected" }, { status: 503 });
  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

  try {
    const body = await buildTrackerResponse({
      client,
      gctx,
      tenantId,
      internalRecipients: tenant.internal_recipients,
      range: params.range,
      level: params.level,
    });
    return Response.json(body);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
