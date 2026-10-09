import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { getTenantById } from "../../../../../../lib/adminAuth";
import { listAdCreatives, recordAdCreative, type RecordInput } from "../../../../../../lib/adCreativeFiles";

// GET  /api/admin/clients/:tenantId/ads/creative-files -> { files }
// POST /api/admin/clients/:tenantId/ads/creative-files { path, name, type, size, width, height } -> { files }
//
// The creatives uploaded for this client. POST files a row once the browser's
// PUT to the signed URL from ./upload-url has landed.
//
// Any admin reads; only the owner uploads.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  try {
    return Response.json({ files: await listAdCreatives(client, ctx.params.tenantId as string) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  if (!(await getTenantById(client, tenantId))) return Response.json({ error: "client not found" }, { status: 404 });

  const body = ((await ctx.request.json().catch(() => null)) ?? {}) as RecordInput;
  const out = await recordAdCreative(client, tenantId, body);
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  return Response.json({ files: await listAdCreatives(client, tenantId) });
};
