import { describe, expect, it } from "vitest";
import { checkPicture, picturePath, PICTURE_MAX_BYTES } from "./clientPicture";

describe("checkPicture", () => {
  it("takes PNG, JPG, WebP and AVIF", () => {
    expect(checkPicture("image/png", 10)).toEqual({ ok: true, ext: "png" });
    expect(checkPicture("IMAGE/JPEG", 10)).toEqual({ ok: true, ext: "jpg" });
    expect(checkPicture("image/webp", 10)).toEqual({ ok: true, ext: "webp" });
    expect(checkPicture("image/avif", 10)).toEqual({ ok: true, ext: "avif" });
  });

  it("refuses SVG, GIF and anything else", () => {
    for (const t of ["image/svg+xml", "image/gif", "application/pdf", "", "text/html"]) {
      expect(checkPicture(t, 10)).toMatchObject({ ok: false, status: 415 });
    }
  });

  it("refuses empty and oversize files", () => {
    expect(checkPicture("image/png", 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkPicture("image/png", PICTURE_MAX_BYTES + 1)).toMatchObject({ ok: false, status: 413 });
    expect(checkPicture("image/png", PICTURE_MAX_BYTES)).toMatchObject({ ok: true });
  });
});

describe("picturePath", () => {
  it("files under the tenant's picture folder", () => {
    expect(picturePath("t1", "png", "abc")).toBe("t1/picture/abc.png");
  });
});
