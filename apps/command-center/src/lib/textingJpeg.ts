// Any image into a JPG small enough to send in a GHL text (Image Converter,
// Jake 2026-10-15: "jpg or jpeg photos that are under 750 kb").
//
// 750,000 bytes rather than 750 KiB, so it is under the cap whichever way GHL
// counts a kilobyte.
export const TEXT_PHOTO_MAX_BYTES = 750_000;

// Quality is spent before pixels: a phone screen shows a 2048px photo no better
// than a 1600px one, but blocky JPEG at low quality shows at any size. So each
// size runs the full quality ladder before the next size down is tried.
const EDGES = [2048, 1600, 1280, 1024, 800, 640];
const QUALITIES = [0.88, 0.78, 0.68, 0.58];

export type Encode = (longEdge: number, quality: number) => Promise<Blob>;

export interface FitResult {
  blob: Blob;
  longEdge: number;
  quality: number;
}

/** The first size and quality that comes in under `maxBytes`, largest first. */
export async function fitUnder(encode: Encode, sourceLongEdge: number, maxBytes = TEXT_PHOTO_MAX_BYTES): Promise<FitResult> {
  // A photo smaller than a rung is never scaled UP to it; its own size is the
  // first rung instead.
  const edges = [...new Set([Math.min(sourceLongEdge, EDGES[0]), ...EDGES.filter((e) => e < sourceLongEdge)])];
  for (const longEdge of edges) {
    for (const quality of QUALITIES) {
      const blob = await encode(longEdge, quality);
      if (blob.size <= maxBytes) return { blob, longEdge, quality };
    }
  }
  throw new Error("Could not get it under 750 KB.");
}

export function jpgName(name: string): string {
  return (name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
}

/** The browser half: decode, flatten onto white (JPG has no transparency), fit. */
export async function toTextingJpeg(source: Blob, name: string): Promise<File> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(source);
  } catch {
    throw new Error("This browser cannot read that image.");
  }
  const { width, height } = bmp;
  const longest = Math.max(width, height);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot convert images.");
  const encode: Encode = (longEdge, quality) => {
    const scale = longEdge / longest;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the JPG."))), "image/jpeg", quality),
    );
  };
  try {
    const { blob } = await fitUnder(encode, longest);
    return new File([blob], jpgName(name), { type: "image/jpeg" });
  } finally {
    bmp.close();
  }
}
