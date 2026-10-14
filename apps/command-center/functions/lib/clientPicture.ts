// The client's picture (0147): what an upload may be, and where it lands.
//
// Raster images only. No SVG: it is a document that can carry script, and the
// picture is opened straight off a public bucket. No GIF: a looping badge in
// the client strip is noise.

export const PICTURE_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type PictureCheck = { ok: true; ext: string } | { ok: false; status: number; error: string };

// The extension comes from the checked MIME type, never the file's own name.
export function checkPicture(type: string, size: number): PictureCheck {
  const ext = EXTENSIONS[(type || "").toLowerCase()];
  if (!ext) return { ok: false, status: 415, error: "That needs to be a PNG, JPG or WebP image." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, status: 400, error: "That file is empty." };
  if (size > PICTURE_MAX_BYTES) return { ok: false, status: 413, error: "That image is over 5 MB." };
  return { ok: true, ext };
}

// Random name per upload: a new picture gets a new URL, so no browser or CDN
// keeps showing the old one from cache.
export function picturePath(tenantId: string, ext: string, id: string = crypto.randomUUID()): string {
  return `${tenantId}/picture/${id}.${ext}`;
}
