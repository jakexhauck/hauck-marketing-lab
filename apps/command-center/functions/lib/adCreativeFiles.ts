import type { SupabaseClient } from "@supabase/supabase-js";

// Ad creatives uploaded into the app (0152), shown on Paid Ads > Creatives.
//
// The operator uploads, the client only looks. Bytes never pass through the
// Worker: the browser PUTs to a signed upload URL, then `record` files the row.
// Reads hand back signed URLs so a private bucket can still feed an <img> or a
// <video> directly.

export const AD_CREATIVES_BUCKET = "ad-creatives";
// Matches the bucket's file_size_limit and the project's global cap.
export const AD_CREATIVE_MAX_BYTES = 50 * 1024 * 1024;
// Long enough to sit on the page and watch a video; the query refetches well
// before it runs out.
const SIGNED_URL_SECONDS = 60 * 60;

export type AdCreativeKind = "image" | "video";

const MIME_EXT: Record<string, { kind: AdCreativeKind; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/webm": { kind: "video", ext: "webm" },
};

export interface AdCreativeFile {
  id: string;
  name: string;
  kind: AdCreativeKind;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  // Signed, short-lived. Null only if signing that one file failed.
  url: string | null;
}

export type UploadCheck =
  | { ok: true; kind: AdCreativeKind; ext: string; mime: string }
  | { ok: false; status: number; error: string };

// What may be uploaded. The bucket enforces the same rules; checking here
// first gives a readable error instead of a storage 4xx after the upload.
export function checkUpload(type: unknown, size: unknown): UploadCheck {
  const mime = String(type ?? "").toLowerCase();
  const hit = MIME_EXT[mime];
  if (!hit) return { ok: false, status: 415, error: "Only images (JPG, PNG, WebP, GIF) and videos (MP4, MOV, WebM)." };
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, status: 400, error: "size is required" };
  if (n > AD_CREATIVE_MAX_BYTES) return { ok: false, status: 413, error: "That file is over 50 MB." };
  return { ok: true, kind: hit.kind, ext: hit.ext, mime };
}

export function newPath(tenantId: string, ext: string): string {
  return `${tenantId}/${crypto.randomUUID()}.${ext}`;
}

// A path handed back by the browser must be one we could have signed for THIS
// tenant, so an upload cannot be filed against another client.
export function pathBelongsTo(path: string, tenantId: string): boolean {
  const re = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/i;
  const m = re.exec(path);
  return Boolean(m) && m![1].toLowerCase() === tenantId.toLowerCase();
}

interface Row {
  id: string;
  path: string;
  name: string;
  kind: AdCreativeKind;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export async function listAdCreatives(client: SupabaseClient, tenantId: string): Promise<AdCreativeFile[]> {
  const { data, error } = await client
    .from("ad_creative_files")
    .select("id,path,name,kind,size_bytes,width,height,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const { data: signed } = await client.storage
    .from(AD_CREATIVES_BUCKET)
    .createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS);
  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    size: Number(r.size_bytes),
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
    url: urlByPath.get(r.path) ?? null,
  }));
}

function dimension(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
}

export interface RecordInput {
  path?: unknown;
  name?: unknown;
  type?: unknown;
  size?: unknown;
  width?: unknown;
  height?: unknown;
}

// File the row once the browser's PUT has landed. The object must really be
// in the bucket: a row pointing at nothing is a tile that never loads.
export async function recordAdCreative(
  client: SupabaseClient,
  tenantId: string,
  input: RecordInput,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = String(input.path ?? "");
  if (!pathBelongsTo(path, tenantId)) return { ok: false, status: 400, error: "invalid path" };
  const check = checkUpload(input.type, input.size);
  if (!check.ok) return check;

  const [folder, file] = path.split("/");
  const { data: found, error: listErr } = await client.storage
    .from(AD_CREATIVES_BUCKET)
    .list(folder, { search: file, limit: 1 });
  if (listErr) return { ok: false, status: 500, error: listErr.message };
  if (!found?.some((o) => o.name === file)) return { ok: false, status: 400, error: "The upload did not arrive." };

  const name = String(input.name ?? "").trim().slice(0, 200) || file;
  const { error } = await client.from("ad_creative_files").insert({
    tenant_id: tenantId,
    path,
    name,
    kind: check.kind,
    mime_type: check.mime,
    size_bytes: Number(input.size),
    width: dimension(input.width),
    height: dimension(input.height),
  });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

export async function deleteAdCreative(
  client: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await client
    .from("ad_creative_files")
    .select("path")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "not found" };

  // Storage first: if it fails the row stays and the delete can be retried.
  const { error: rmErr } = await client.storage.from(AD_CREATIVES_BUCKET).remove([data.path as string]);
  if (rmErr) return { ok: false, status: 500, error: rmErr.message };
  const { error: delErr } = await client.from("ad_creative_files").delete().eq("id", id);
  if (delErr) return { ok: false, status: 500, error: delErr.message };
  return { ok: true };
}
