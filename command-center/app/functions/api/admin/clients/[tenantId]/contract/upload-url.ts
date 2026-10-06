import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { getTenantById } from "../../../../../lib/adminAuth";
import { CONTRACT_BUCKET, CONTRACT_MAX_BYTES } from "../../../../../lib/clientContract";

// POST /api/admin/clients/:tenantId/contract/upload-url  { type, size }
//   -> { uploadUrl, path }
//
// A one-time signed upload URL into the private client-contracts bucket. The
// browser PUTs the PDF itself, then hands `path` to /contract/read. The Worker
// only signs: the bytes never pass through it (free plan CPU, and a 15 MB scan
// has no business in Worker memory).
//
// Owner only.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const body = (await ctx.request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (String(body?.type ?? "").toLowerCase() !== "application/pdf") {
    return Response.json({ error: "That needs to be a PDF." }, { status: 415 });
  }
  const size = Number(body?.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return Response.json({ error: "size is required" }, { status: 400 });
  if (size > CONTRACT_MAX_BYTES) {
    return Response.json({ error: "That PDF is over 15 MB." }, { status: 413 });
  }

  const path = `${tenantId}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await client.storage.from(CONTRACT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });
  }
  return Response.json({ uploadUrl: data.signedUrl, path });
};
