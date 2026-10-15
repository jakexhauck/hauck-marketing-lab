import { describe, expect, it } from "vitest";
import type { DriveFile } from "./driveDirect";
import { isUnderFolder, walkImages } from "./clientDriveImages";

const file = (id: string, name: string, mimeType: string): DriveFile => ({
  id,
  name,
  mimeType,
  isFolder: mimeType === "application/vnd.google-apps.folder",
  webViewLink: null,
  iconLink: null,
  thumbnailLink: `https://thumb/${id}=s220`,
  modifiedTime: null,
  size: "1000",
});
const folder = (id: string, name: string) => file(id, name, "application/vnd.google-apps.folder");

const tree: Record<string, DriveFile[]> = {
  root: [file("a", "logo.png", "image/png"), file("doc", "Copy", "application/vnd.google-apps.document"), folder("fc", "Finished Creatives")],
  fc: [file("b", "before.jpg", "image/jpeg"), folder("mar", "March")],
  mar: [file("c", "IMG_1.heic", "image/heic"), folder("root", "loop back")],
};

describe("walkImages", () => {
  it("finds images at every level with their folder path, and skips docs and loops", async () => {
    let calls = 0;
    const images = await walkImages("root", async (ids) => {
      calls++;
      return new Map(ids.map((id) => [id, tree[id] ?? []]));
    });
    expect(images.map((i) => [i.id, i.folder])).toEqual([
      ["a", ""],
      ["b", "Finished Creatives"],
      ["c", "Finished Creatives / March"],
    ]);
    expect(images[0].size).toBe(1000);
    // One call per level, and the loop back to root is not walked again.
    expect(calls).toBe(3);
  });
});

describe("isUnderFolder", () => {
  const parents: Record<string, string[]> = { c: ["mar"], mar: ["fc"], fc: ["root"], root: ["drive"], x: ["other"] };
  const parentsOf = async (id: string) => parents[id] ?? [];

  it("walks up to the client folder", async () => {
    expect(await isUnderFolder("c", "root", parentsOf)).toBe(true);
  });

  it("refuses a file from somewhere else in the Drive", async () => {
    expect(await isUnderFolder("x", "root", parentsOf)).toBe(false);
  });
});
