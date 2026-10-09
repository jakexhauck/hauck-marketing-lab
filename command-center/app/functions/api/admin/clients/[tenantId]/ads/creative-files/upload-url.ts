import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { getTenantById } from "../../../../../../lib/adminAuth";
import { AD_CREATIVES_BUCKET, checkUpload, newPath } from "../../../../../../lib/adCreativeFiles";

// POST /api/admin/clients/:tenantId/ads/creative-files/upload-url { type, size }
//   -> { uploadUrl, path }
//
// A one-time signed upload URL into the private ad-creatives bucket. The
// browser PUTs the file itself, so a 50 MB video never sits in Worker memory.
//
// Owner only.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  if (!(await getTenantById(client, tenantId))) return Response.json({ error: "client not found" }, { status: 404 });

  const body = (await ctx.request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  const check = checkUpload(body?.type, body?.size);
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

  const path = newPath(tenantId, check.ext);
  const { data, error } = await client.storage.from(AD_CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });
  return Response.json({ uploadUrl: data.signedUrl, path });
};
