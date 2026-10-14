import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { listAdCreatives } from "../../lib/adCreativeFiles";

// GET /api/ads/creative-files -> { files }
//
// The client's own creatives, read only. Scoped to the session tenant, so it
// can only ever return the caller's own files whatever they send.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });
  try {
    return Response.json({ files: await listAdCreatives(client, tenantId) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
