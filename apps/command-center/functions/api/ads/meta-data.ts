import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { loadMetaDataRows } from "../../lib/metaDataRows";

// GET /api/ads/meta-data -> { rows, currency }
//
// The sheet's META DATA tab for the SESSION tenant. The rows themselves are
// loaded in lib/metaDataRows.ts, which the admin cockpit's route calls too.

export type { MetaDataRow } from "../../lib/metaDataRows";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const t = ctx.data.tenant;
  const tenantId = await resolveTenantId(client, t.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const res = await loadMetaDataRows(client, tenantId);
  if ("error" in res) return Response.json({ error: res.error }, { status: 500 });

  return Response.json({ rows: res.rows, currency: "USD" });
};
