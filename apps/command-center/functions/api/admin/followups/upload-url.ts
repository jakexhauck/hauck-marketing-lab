import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { VIDEO_EXTENSIONS, VIDEO_MAX_BYTES } from "../../../lib/conversionAssets";

// POST /api/admin/followups/upload-url  { tenantId, type, size }
//   -> { uploadUrl, url }
//
// A one-time signed upload URL for an owner video. The browser PUTs the file
// to uploadUrl itself and stores url, the public address it will live at.
//
// Why not /upload like the photos: that route reads the whole file into Worker
// memory. A phone video is tens of megabytes, and a Worker holding it is a
// Worker one bad day from the 128 MB ceiling. Here the Worker only signs; the
// bytes never touch it.
//
// Same bucket and same public reasoning as /upload: the page is served on the
// client's domain and opened by strangers, so the URL must not expire.
//
// Admin-only: gated centrally in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = (await ctx.request.json().catch(() => null)) as {
    tenantId?: unknown;
    type?: unknown;
    size?: unknown;
  } | null;

  const tenantId = String(body?.tenantId ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const type = String(body?.type ?? "").toLowerCase();
  const ext = VIDEO_EXTENSIONS[type];
  if (!ext) {
    return Response.json({ error: "That needs to be an MP4, MOV or WebM video." }, { status: 415 });
  }

  const size = Number(body?.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return Response.json({ error: "size is required" }, { status: 400 });
  }
  if (size > VIDEO_MAX_BYTES) {
    return Response.json(
      { error: "That video is over 50 MB. Trim it or export it smaller." },
      { status: 413 },
    );
  }

  // Random name, tenant and slot in the path, exactly like /upload. The
  // extension comes from the checked MIME type, never the file's own name.
  const path = `${tenantId}/owner/${crypto.randomUUID()}.${ext}`;
  const bucket = client.storage.from("followup-assets");

  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });
  }

  return Response.json({
    uploadUrl: data.signedUrl,
    url: bucket.getPublicUrl(path).data.publicUrl,
  });
};
