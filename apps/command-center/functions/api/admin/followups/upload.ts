import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { UPLOAD_FOLDERS, type UploadFolder } from "../../../lib/conversionAssets";

// POST /api/admin/followups/upload  (multipart/form-data: tenantId, slot, file)
//   -> { url }
//
// Files for a conversion asset: the logo, a design kit, the owner's photo and
// the before/after photos of each job. Bytes go to the public `followup-assets`
// bucket (0095) and the caller gets a plain URL back.
//
// PUBLIC, deliberately. The built page is served on the CLIENT'S domain by
// GoHighLevel and opened by strangers off a text message. A signed URL expires,
// which means a live page whose photos silently vanish a week after it ships.
// Nothing here is private: it is marketing photography the client wants seen.
//
// Uploads do NOT go through the Drive path the ad creatives use. That one needs
// an OAuth grant and a per-client folder, and a Drive link is not something an
// <img> on someone else's domain can load.
//
// Admin-only: gated centrally in api/_middleware.ts.

// Well past a phone photo, short of a video file landing in an image bucket.
const MAX_BYTES = 15 * 1024 * 1024;

// Images for every slot; a design kit may also be a PDF or a zip, because that
// is what a brand kit actually arrives as.
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);
const KIT_TYPES = new Set([...IMAGE_TYPES, "application/pdf", "application/zip"]);

// The extension is derived from the MIME type, never from the uploaded name.
// A filename is attacker-controlled text; a content type we have already
// checked against an allowlist is not.
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }

  const tenantId = String(form.get("tenantId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const rawSlot = String(form.get("slot") ?? "").trim();
  // An allowlist, not a passthrough: this string becomes a path segment.
  const folder: string = UPLOAD_FOLDERS.includes(rawSlot as UploadFolder) ? rawSlot : "extra";

  const entry = form.get("file") as unknown;
  if (entry === null || typeof entry === "string") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  const file = entry as { arrayBuffer(): Promise<ArrayBuffer>; type?: string; size?: number };
  if (typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }

  const type = (file.type || "").toLowerCase();
  const allowed = folder === "kit" ? KIT_TYPES : IMAGE_TYPES;
  if (!allowed.has(type)) {
    return Response.json(
      {
        error:
          folder === "kit"
            ? "A design kit must be an image, a PDF or a zip."
            : "That needs to be an image.",
      },
      { status: 415 },
    );
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "That file is over 15 MB." }, { status: 413 });
  }

  // Path carries the tenant and the slot so the bucket stays browsable, and a
  // random name so two uploads of "IMG_1234.jpg" cannot collide or overwrite.
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${EXTENSIONS[type] ?? "bin"}`;

  const { error } = await client.storage
    .from("followup-assets")
    .upload(path, bytes, { contentType: type, upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data } = client.storage.from("followup-assets").getPublicUrl(path);
  return Response.json({ url: data.publicUrl });
};
