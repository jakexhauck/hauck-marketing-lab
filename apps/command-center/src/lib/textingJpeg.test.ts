import { describe, expect, it } from "vitest";
import { fitUnder, jpgName, TEXT_PHOTO_MAX_BYTES } from "./textingJpeg";

// A fake encoder: bytes grow with pixel count and quality, roughly like JPEG.
const fake = (bytesPerPixelAtFull: number) => {
  const tried: [number, number][] = [];
  const encode = async (edge: number, q: number) => {
    tried.push([edge, q]);
    return { size: Math.round(edge * edge * 0.75 * bytesPerPixelAtFull * q) } as Blob;
  };
  return { encode, tried };
};

describe("fitUnder", () => {
  it("keeps the first size and quality that fits", async () => {
    const { encode, tried } = fake(0.1);
    const out = await fitUnder(encode, 4000);
    expect(out.longEdge).toBe(2048);
    expect(out.quality).toBe(0.88);
    expect(out.blob.size).toBeLessThanOrEqual(TEXT_PHOTO_MAX_BYTES);
    expect(tried).toHaveLength(1);
  });

  it("drops quality before it drops size", async () => {
    const { encode, tried } = fake(0.5);
    const out = await fitUnder(encode, 4000);
    expect(out.blob.size).toBeLessThanOrEqual(TEXT_PHOTO_MAX_BYTES);
    expect(tried.slice(0, 4).every(([e]) => e === 2048)).toBe(true);
    expect(out.longEdge).toBeLessThan(2048);
  });

  it("never scales a small photo up", async () => {
    const { encode, tried } = fake(0.1);
    await fitUnder(encode, 900);
    expect(tried[0][0]).toBe(900);
  });

  it("throws when nothing fits", async () => {
    const { encode } = fake(1000);
    await expect(fitUnder(encode, 4000)).rejects.toThrow("750 KB");
  });
});

describe("jpgName", () => {
  it("swaps the extension", () => {
    expect(jpgName("Window 1 BEFORE.png")).toBe("Window 1 BEFORE.jpg");
    expect(jpgName("IMG_2691.HEIC")).toBe("IMG_2691.jpg");
  });
});
