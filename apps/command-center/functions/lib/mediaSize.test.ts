import { describe, expect, it } from "vitest";
import { mediaSize } from "./mediaSize";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat();
  return [...be32(8 + body.length), ...ascii(type), ...body];
};

// A version 0 tkhd: 76 bytes of header fields (the matrix at 40), then width and height in 16.16.
function tkhd(width: number, height: number, rotate90 = false) {
  const p = new Array(76).fill(0);
  const matrix = rotate90 ? [0, 1 << 16, 0, -(1 << 16), 0, 0, 0, 0, 1 << 30] : [1 << 16, 0, 0, 0, 1 << 16, 0, 0, 0, 1 << 30];
  matrix.forEach((v, i) => p.splice(40 + i * 4, 4, ...be32(v)));
  return box("tkhd", p, be32(width * 65536), be32(height * 65536));
}

describe("mediaSize", () => {
  it("reads a PNG", () => {
    expect(mediaSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), ascii("IHDR"), be32(1080), be32(1350)))).toEqual({ width: 1080, height: 1350 });
  });

  it("reads a GIF", () => {
    // Header and logical screen descriptor: 13 bytes, the smallest a GIF can be.
    expect(mediaSize(bytes(ascii("GIF89a"), le16(600), le16(400), [0, 0, 0]))).toEqual({ width: 600, height: 400 });
  });

  it("reads a JPEG past the segments before its frame header", () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...new Array(14).fill(0)];
    const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(1920), ...be16(1080), 3, ...new Array(9).fill(0)];
    expect(mediaSize(bytes([0xff, 0xd8], app0, sof))).toEqual({ width: 1080, height: 1920 });
  });

  it("turns a phone JPEG by its EXIF orientation, the way the browser shows it", () => {
    // APP1 Exif, big-endian TIFF, one IFD0 entry: Orientation (0x0112) = 6, a quarter turn.
    const tiff = [...ascii("MM"), ...be16(42), ...be32(8), ...be16(1), ...be16(0x0112), ...be16(3), ...be32(1), ...be16(6), 0, 0, ...be32(0)];
    const app1 = [0xff, 0xe1, ...be16(2 + 6 + tiff.length), ...ascii("Exif"), 0, 0, ...tiff];
    const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(3024), ...be16(4032), 3, ...new Array(9).fill(0)];
    expect(mediaSize(bytes([0xff, 0xd8], app1, sof))).toEqual({ width: 3024, height: 4032 });
  });

  it("reads each kind of WebP", () => {
    const riff = (chunk: number[]) => bytes(ascii("RIFF"), be32(0), ascii("WEBP"), chunk);
    expect(mediaSize(riff([...ascii("VP8X"), ...be32(10), 0, 0, 0, 0, ...le24(1079), ...le24(1919)]))).toEqual({ width: 1080, height: 1920 });
    expect(mediaSize(riff([...ascii("VP8 "), ...be32(10), 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(600)]))).toEqual({ width: 800, height: 600 });
    // VP8L packs width-1 and height-1 into 14 bits each after the 0x2f signature.
    const bits = (1080 - 1) | ((1350 - 1) << 14);
    expect(mediaSize(riff([...ascii("VP8L"), ...be32(5), 0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]))).toEqual({
      width: 1080,
      height: 1350,
    });
  });

  it("reads an MP4's video track, skipping the audio track's zero size", () => {
    const mp4 = bytes(box("ftyp", ascii("isom")), box("moov", box("mvhd", new Array(20).fill(0)), box("trak", tkhd(0, 0)), box("trak", tkhd(1080, 1920))));
    expect(mediaSize(mp4)).toEqual({ width: 1080, height: 1920 });
  });

  it("turns a phone video's rotated track the way it plays", () => {
    expect(mediaSize(bytes(box("ftyp", ascii("qt  ")), box("moov", box("trak", tkhd(1920, 1080, true)))))).toEqual({ width: 1080, height: 1920 });
  });

  it("says null rather than guess", () => {
    expect(mediaSize(bytes(ascii("not a picture at all")))).toBeNull();
    expect(mediaSize(bytes([0x89, 0x50]))).toBeNull();
    expect(mediaSize(bytes([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
