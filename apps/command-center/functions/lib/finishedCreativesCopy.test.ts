import { describe, expect, it } from "vitest";
import type { DriveCreative } from "./finishedCreatives";
import { copyBatch, MAX_COPY_PER_CALL, planCopy } from "./finishedCreativesCopy";

const MB = 1024 * 1024;

function file(id: string, name: string, mimeType: string, size: number | null = 2 * MB, inApp = false): DriveCreative {
  return { id, name, mimeType, size, thumbnailLink: null, folder: "", kind: mimeType.startsWith("video/") ? "video" : "image", inApp };
}

describe("planCopy", () => {
  it("copies what is not in the app yet, and counts what already is", () => {
    const plan = planCopy([file("a", "a.png", "image/png"), file("b", "b.mp4", "video/mp4", 40 * MB), file("c", "c.jpg", "image/jpeg", MB, true)], undefined);
    expect(plan.copy.map((f) => f.id)).toEqual(["a", "b"]);
    expect(plan.alreadyInApp).toBe(1);
    expect(plan.skipped).toEqual([]);
  });

  it("skips what only the browser can convert, saying where to do it", () => {
    const plan = planCopy([file("m", "clip.mov", "video/quicktime"), file("big", "long.mp4", "video/mp4", 60 * MB), file("t", "scan.tiff", "image/tiff")], undefined);
    expect(plan.copy).toEqual([]);
    expect(plan.skipped.map((s) => s.name)).toEqual(["clip.mov", "long.mp4", "scan.tiff"]);
    for (const s of plan.skipped) expect(s.reason).toMatch(/Add Creatives/);
    expect(plan.skipped[1].reason).toMatch(/50 MB/);
  });

  it("takes an iPhone HEIC, which goes in as Drive's own JPEG", () => {
    expect(planCopy([file("h", "IMG_1.HEIC", "image/heic")], undefined).copy.map((f) => f.id)).toEqual(["h"]);
  });

  it("copies only the files named, by id or by name, and says which it could not find", () => {
    const files = [file("a", "Hook A.png", "image/png"), file("b", "b.mp4", "video/mp4"), file("c", "c.jpg", "image/jpeg", MB, true)];
    const plan = planCopy(files, ["hook a.png", "b", "c.jpg", "nope.png"]);
    expect(plan.copy.map((f) => f.id)).toEqual(["a", "b"]);
    expect(plan.alreadyInApp).toBe(1);
    expect(plan.notFound).toEqual(["nope.png"]);
  });

  it("lists every file it can copy, in Drive's order", () => {
    const files = Array.from({ length: MAX_COPY_PER_CALL + 3 }, (_, i) => file(`f${i}`, `f${i}.png`, "image/png"));
    expect(planCopy(files, undefined).copy).toHaveLength(MAX_COPY_PER_CALL + 3);
  });

  it("does a few per call and says how many are left", async () => {
    const files = Array.from({ length: MAX_COPY_PER_CALL + 3 }, (_, i) => file(`f${i}`, `f${i}.png`, "image/png"));
    const r = await copyBatch(files, async (f) => ({ name: f.name, width: 1, height: 1 }));
    expect(r.added).toHaveLength(MAX_COPY_PER_CALL);
    expect(r.left).toBe(3);
  });

  it("goes past files that fail, so a stuck one never blocks the rest", async () => {
    const bad = Array.from({ length: MAX_COPY_PER_CALL }, (_, i) => file(`bad${i}`, `bad${i}.heic`, "image/heic"));
    const good = [file("g1", "g1.png", "image/png"), file("g2", "g2.png", "image/png")];
    const r = await copyBatch([...bad, ...good], async (f) => {
      if (f.id.startsWith("bad")) throw new Error("Drive has no preview of this HEIC yet.");
      return { name: f.name, width: 1, height: 1 };
    });
    expect(r.added.map((a) => a.name)).toEqual(["g1.png", "g2.png"]);
    expect(r.failed).toHaveLength(MAX_COPY_PER_CALL);
    expect(r.left).toBe(0);
  });

  it("refuses a files list that is not one", () => {
    expect(() => planCopy([], "a.png")).toThrow(/list/);
  });
});
