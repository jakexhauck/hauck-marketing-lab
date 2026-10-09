import { describe, expect, it } from "vitest";
import { cappedSize, UPLOAD_CAP_BYTES, videoBitrateFor } from "./shrinkCreative";

describe("videoBitrateFor", () => {
  it("fits video plus audio under the cap", () => {
    for (const sec of [15, 30, 60, 120, 300]) {
      const bps = videoBitrateFor(sec)!;
      const bytes = ((bps + 128_000) * sec) / 8;
      expect(bytes).toBeLessThan(UPLOAD_CAP_BYTES);
    }
  });

  it("caps short videos at the useful maximum", () => {
    expect(videoBitrateFor(10)).toBe(8_000_000);
  });

  it("gives up when the video is too long to look decent", () => {
    expect(videoBitrateFor(60 * 60)).toBeNull();
  });

  it("refuses a missing duration", () => {
    expect(videoBitrateFor(0)).toBeNull();
    expect(videoBitrateFor(Number.NaN)).toBeNull();
  });
});

describe("cappedSize", () => {
  it("leaves 1080p and smaller alone", () => {
    expect(cappedSize(1080, 1920)).toBeNull();
    expect(cappedSize(1920, 1080)).toBeNull();
    expect(cappedSize(720, 1280)).toBeNull();
  });

  it("scales 4K down to 1080 on the short side, keeping aspect", () => {
    expect(cappedSize(2160, 3840)).toEqual({ width: 1080, height: 1920 });
    expect(cappedSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  it("keeps both sides even", () => {
    const s = cappedSize(1441, 1801)!;
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
  });
});
