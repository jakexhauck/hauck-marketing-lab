import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { loadMetaDataRows } from "../../../../../lib/metaDataRows";

// GET /api/admin/clients/:tenantId/ads/meta-data -> { rows, currency }
//
// The SAME payload as the client's own /api/ads/meta-data, for a client named in
// the URL rather than in the session, so the cockpit can render the client's own
// Meta Data tab. Auth is enforced upstream in _middleware.ts (admin session
// only).
//
// Reads meta_ad_days directly. No GHL call and no ad-account call: this is the
// nightly snapshot as stored, which is the whole point of the tab.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  // Resolved rather than trusted: an unknown id must 404, not return an empty
  // sheet that reads as "this client has no spend".
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const res = await loadMetaDataRows(client, tenantId);
  if ("error" in res) return Response.json({ error: res.error }, { status: 500 });

  return Response.json({ rows: res.rows, currency: "USD" });
};
