import { describe, expect, it } from "vitest";
import { AD_CREATIVE_MAX_BYTES, checkUpload, newPath, pathBelongsTo } from "./adCreativeFiles";

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

describe("checkUpload", () => {
  it("accepts images and videos with their kind and extension", () => {
    expect(checkUpload("image/jpeg", 1000)).toEqual({ ok: true, kind: "image", ext: "jpg", mime: "image/jpeg" });
    expect(checkUpload("VIDEO/QUICKTIME", 1000)).toEqual({ ok: true, kind: "video", ext: "mov", mime: "video/quicktime" });
  });

  it("refuses anything that is not an image or video", () => {
    expect(checkUpload("application/pdf", 1000)).toMatchObject({ ok: false, status: 415 });
    expect(checkUpload("", 1000)).toMatchObject({ ok: false, status: 415 });
  });

  it("refuses a missing size and anything over the cap", () => {
    expect(checkUpload("image/png", 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkUpload("image/png", "abc")).toMatchObject({ ok: false, status: 400 });
    expect(checkUpload("video/mp4", AD_CREATIVE_MAX_BYTES)).toMatchObject({ ok: true });
    expect(checkUpload("video/mp4", AD_CREATIVE_MAX_BYTES + 1)).toMatchObject({ ok: false, status: 413 });
  });
});

describe("pathBelongsTo", () => {
  it("accepts a path this tenant was signed for", () => {
    expect(pathBelongsTo(newPath(TENANT, "mp4"), TENANT)).toBe(true);
  });

  it("refuses another tenant's path", () => {
    expect(pathBelongsTo(newPath(OTHER, "jpg"), TENANT)).toBe(false);
  });

  it("refuses traversal, odd extensions and junk", () => {
    expect(pathBelongsTo(`${TENANT}/../${OTHER}/x.jpg`, TENANT)).toBe(false);
    expect(pathBelongsTo(`${TENANT}/${crypto.randomUUID()}.exe`, TENANT)).toBe(false);
    expect(pathBelongsTo(`${TENANT}/${crypto.randomUUID()}.jpg/extra`, TENANT)).toBe(false);
    expect(pathBelongsTo("", TENANT)).toBe(false);
  });
});
