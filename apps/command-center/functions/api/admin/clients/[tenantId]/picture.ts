import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { checkPicture, picturePath } from "../../../../lib/clientPicture";

// POST   /api/admin/clients/:tenantId/picture  (multipart: file)  -> { url }
// DELETE /api/admin/clients/:tenantId/picture                     -> { url: null }
//
// The client's picture (0147). Stands in for the initials badge in the admin
// client strip and the client's own app.
//
// Bytes go to the public `followup-assets` bucket (0095), same as the
// conversion asset photos: the client app loads it as a plain <img>, and a
// signed URL would expire under a long-lived session. A logo is not private.
//
// A replaced picture's old file is left in the bucket: it is a few hundred KB
// and deleting it races any open tab still showing it.
//
// Admin-only (owner by default) via the /api/admin/* gate in _middleware.ts.

const BUCKET = "followup-assets";

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const entry = form.get("file") as unknown;
  if (entry === null || typeof entry === "string") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  const file = entry as { arrayBuffer(): Promise<ArrayBuffer>; type?: string; size?: number };
  if (typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }

  const type = (file.type || "").toLowerCase();
  const bytes = await file.arrayBuffer();
  const check = checkPicture(type, bytes.byteLength);
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

  const path = picturePath(tenantId, check.ext);
  const bucket = client.storage.from(BUCKET);
  const { error: upErr } = await bucket.upload(path, bytes, { contentType: type, upsert: false });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { error } = await client.from("tenants").update({ brand_logo_url: url }).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.picture", tenantId, { url });
  return Response.json({ url });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const { error } = await client.from("tenants").update({ brand_logo_url: null }).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.picture", tenantId, { url: null });
  return Response.json({ url: null });
};
