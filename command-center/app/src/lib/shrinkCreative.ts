// Shrinking a creative that is over the 50 MB upload cap (Supabase free plan),
// in the browser, before it uploads.
//
// Videos are re-encoded to H.264 MP4 through Mediabunny, which drives the
// browser's own WebCodecs encoder (so the GPU does the work). The bitrate is
// worked out from the duration so the result lands under the cap. Images are
// redrawn to a JPEG on a canvas. The shrunk file is a viewing copy only: if a
// creative ever goes to Meta from here, Meta should get the original.
//
// Mediabunny is imported lazily: it is only needed for the rare oversize file,
// and the rest of the app should not pay for it.

export const UPLOAD_CAP_BYTES = 50 * 1024 * 1024;
// Aim under the cap, leaving room for container overhead and encoder overshoot.
const TARGET_BYTES = 45 * 1024 * 1024;
const AUDIO_BPS = 128_000;
// Past this an ad is visually lossless; spending more only makes the file bigger.
const MAX_VIDEO_BPS = 8_000_000;
// Below this 1080p turns to mush. A video that needs less is too long to shrink.
const MIN_VIDEO_BPS = 600_000;
// The shorter side is capped at 1080: every ad placement is 1080 wide or less.
const MAX_SHORT_SIDE = 1080;
const MAX_IMAGE_LONG_SIDE = 4096;

export class ShrinkError extends Error {}

// Video bitrate that fits `duration` seconds (plus audio) into the target, or
// null when even the floor would not fit.
export function videoBitrateFor(durationSec: number, targetBytes = TARGET_BYTES): number | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const totalBps = (targetBytes * 8 * 0.95) / durationSec;
  const video = Math.floor(totalBps - AUDIO_BPS);
  if (video < MIN_VIDEO_BPS) return null;
  return Math.min(video, MAX_VIDEO_BPS);
}

// Output size with the shorter side capped, aspect kept, both sides even (H.264
// needs even dimensions). Null means leave the size alone.
export function cappedSize(width: number, height: number, maxShort = MAX_SHORT_SIDE): { width: number; height: number } | null {
  const short = Math.min(width, height);
  if (!(short > maxShort)) return null;
  const scale = maxShort / short;
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

function renamed(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}

async function shrinkVideo(file: File, onProgress: (fraction: number) => void): Promise<File> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  const duration = await input.computeDuration();

  const attempt = async (bitrate: number, maxShort: number): Promise<ArrayBuffer> => {
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: (track) => ({
        codec: "avc",
        quality: new mb.Quality({ bitrate }),
        // cappedSize already keeps the aspect, so "fill" only absorbs the
        // rounding to even pixels. Mediabunny requires a fit with both sides.
        ...(cappedSize(track.displayWidth, track.displayHeight, maxShort) ?? {}),
        fit: "fill",
        forceTranscode: true,
      }),
      audio: { codec: "aac", quality: new mb.Quality({ bitrate: AUDIO_BPS }) },
    });
    if (!conversion.isValid) throw new ShrinkError("This browser cannot shrink that video.");
    conversion.onProgress = (p) => onProgress(Math.min(1, p));
    await conversion.execute();
    if (!target.buffer) throw new ShrinkError("Shrinking produced no file.");
    return target.buffer;
  };

  const bitrate = videoBitrateFor(duration);
  if (bitrate == null) throw new ShrinkError("Too long to shrink under 50 MB. Export it smaller.");

  let out = await attempt(bitrate, MAX_SHORT_SIDE);
  // Encoders overshoot on busy or grainy footage. One more pass, lower and at
  // 720p, where the same detail costs far fewer bytes.
  if (out.byteLength > UPLOAD_CAP_BYTES) {
    onProgress(0);
    out = await attempt(Math.max(MIN_VIDEO_BPS, Math.floor(bitrate * 0.6)), 720);
  }
  if (out.byteLength > UPLOAD_CAP_BYTES) throw new ShrinkError("Could not get it under 50 MB. Export it smaller.");
  return new File([out], renamed(file.name, "mp4"), { type: "video/mp4" });
}

async function shrinkImage(file: File): Promise<File> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new ShrinkError("This browser cannot read that image.");
  }
  const scale = Math.min(1, MAX_IMAGE_LONG_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.9, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= UPLOAD_CAP_BYTES) return new File([blob], renamed(file.name, "jpg"), { type: "image/jpeg" });
  }
  throw new ShrinkError("Could not get it under 50 MB. Export it smaller.");
}

export async function shrinkCreative(file: File, onProgress: (fraction: number) => void): Promise<File> {
  const type = file.type || "";
  if (type.startsWith("video/")) {
    if (typeof VideoEncoder === "undefined") throw new ShrinkError("This browser cannot shrink video. Use Chrome or Edge.");
    return shrinkVideo(file, onProgress);
  }
  if (type.startsWith("image/")) return shrinkImage(file);
  throw new ShrinkError("Not an image or video.");
}
