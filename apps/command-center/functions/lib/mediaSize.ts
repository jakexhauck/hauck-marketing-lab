// A creative's pixel size, read from its own header bytes on the server. The
// browser measures with createImageBitmap and a <video> (src/lib/creativeProbe.ts);
// the Grok connector copies creatives with no browser, and the Meta connector
// hands width and height to the bots for placements, so it reads them here.
//
// PNG, JPEG, GIF, WebP and MP4/MOV, each the way it shows: a phone JPEG turned
// by its EXIF orientation and a phone video by its track matrix, as the browser
// does. Anything else, or a header that does not parse, is null: an unknown
// size, never a guessed one.

export interface Size {
  width: number;
  height: number;
}

const ok = (width: number, height: number): Size | null => (width > 0 && height > 0 ? { width, height } : null);

function tag(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

function png(b: Uint8Array, v: DataView): Size | null {
  if (b.length < 24 || tag(b, 12) !== "IHDR") return null;
  return ok(v.getUint32(16), v.getUint32(20));
}

function gif(b: Uint8Array, v: DataView): Size | null {
  return b.length < 10 ? null : ok(v.getUint16(6, true), v.getUint16(8, true));
}

// Start-of-frame markers carry the size: C0-CF except C4 (huffman), C8 (reserved) and CC (arithmetic).
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** The EXIF Orientation (1 to 8) in an APP1 segment starting at `at`, or 1. */
function exifOrientation(b: Uint8Array, v: DataView, at: number): number {
  try {
    if (tag(b, at + 4) !== "Exif" || b[at + 8] !== 0 || b[at + 9] !== 0) return 1;
    const t = at + 10;
    const little = b[t] === 0x49;
    const ifd = t + v.getUint32(t + 4, little);
    const count = v.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little);
    }
  } catch {
    // A broken EXIF block says nothing about the turn; the frame size still stands.
  }
  return 1;
}

function jpeg(b: Uint8Array, v: DataView): Size | null {
  let at = 2;
  let orientation = 1;
  while (at + 9 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xe1) orientation = exifOrientation(b, v, at);
    if (SOF.has(marker)) {
      const width = v.getUint16(at + 7);
      const height = v.getUint16(at + 5);
      // 5 to 8 are the quarter turns.
      return orientation >= 5 && orientation <= 8 ? ok(height, width) : ok(width, height);
    }
    at += 2 + v.getUint16(at + 2);
  }
  return null;
}

function webp(b: Uint8Array, v: DataView): Size | null {
  const chunk = tag(b, 12);
  const at = 20;
  const u24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (chunk === "VP8X" && b.length >= at + 10) return ok(u24(at + 4) + 1, u24(at + 7) + 1);
  if (chunk === "VP8 " && b.length >= at + 10) return ok(v.getUint16(at + 6, true) & 0x3fff, v.getUint16(at + 8, true) & 0x3fff);
  if (chunk === "VP8L" && b.length >= at + 5 && b[at] === 0x2f) {
    const bits = v.getUint32(at + 1, true);
    return ok((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  return null;
}

/** The first track header with a size (audio tracks have none), turned the way the video plays. */
function mp4(b: Uint8Array, v: DataView): Size | null {
  const walk = (start: number, end: number): Size | null => {
    let at = start;
    while (at + 8 <= end) {
      let size = v.getUint32(at);
      const type = tag(b, at + 4);
      let head = 8;
      if (size === 1) {
        if (at + 16 > end) return null;
        size = Number(v.getBigUint64(at + 8));
        head = 16;
      } else if (size === 0) size = end - at;
      if (size < head || at + size > end) return null;
      if (type === "moov" || type === "trak") {
        const found = walk(at + head, at + size);
        if (found) return found;
      } else if (type === "tkhd") {
        const p = at + head;
        // Version 1 widens the three time fields to 64 bits.
        const wide = b[p] === 1 ? 12 : 0;
        const wAt = p + 76 + wide;
        if (wAt + 8 <= at + size) {
          const width = Math.round(v.getUint32(wAt) / 65536);
          const height = Math.round(v.getUint32(wAt + 4) / 65536);
          if (width > 0 && height > 0) {
            // Matrix a and b: a quarter turn stores a = 0, b = +-1.
            const a = v.getInt32(p + 40 + wide);
            const turned = a === 0 && v.getInt32(p + 44 + wide) !== 0;
            return turned ? ok(height, width) : ok(width, height);
          }
        }
      }
      at += size;
    }
    return null;
  };
  return walk(0, b.length);
}

export function mediaSize(bytes: ArrayBuffer | Uint8Array): Size | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (b[0] === 0x89 && tag(b, 1) === "PNG\r") return png(b, v);
    if (tag(b, 0) === "GIF8") return gif(b, v);
    if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b, v);
    if (tag(b, 0) === "RIFF" && tag(b, 8) === "WEBP") return webp(b, v);
    if (tag(b, 4) === "ftyp") return mp4(b, v);
  } catch {
    return null;
  }
  return null;
}
