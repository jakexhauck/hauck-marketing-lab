import { describe, expect, it } from "vitest";
import type { DriveFile } from "./driveDirect";
import { walkImages } from "./clientDriveImages";
import { isCreativeMime, pickFinishedCreatives, toDriveCreatives } from "./finishedCreatives";

const file = (id: string, name: string, mimeType: string): DriveFile => ({
  id,
  name,
  mimeType,
  isFolder: mimeType === "application/vnd.google-apps.folder",
  webViewLink: null,
  iconLink: null,
  thumbnailLink: null,
  modifiedTime: null,
  size: "2000",
});

describe("pickFinishedCreatives", () => {
  it("finds the folder whatever its case or spacing", () => {
    const folders = [
      { id: "a", name: "Assets" },
      { id: "fc", name: " finished  creatives " },
    ];
    expect(pickFinishedCreatives(folders)?.id).toBe("fc");
  });

  it("is null when the client folder has none", () => {
    expect(pickFinishedCreatives([{ id: "a", name: "Finished Creatives OLD" }])).toBeNull();
  });
});

describe("Finished Creatives listing", () => {
  const tree: Record<string, DriveFile[]> = {
    fc: [
      file("img", "Selfie Van 1∶1.png", "image/png"),
      file("vid", "Hook 4:5.mp4", "video/mp4"),
      file("doc", "Notes", "application/vnd.google-apps.document"),
      file("sub", "Images", "application/vnd.google-apps.folder"),
    ],
    sub: [file("mov", "Install.mov", "video/quicktime")],
  };
  const list = async (ids: string[]) => new Map(ids.map((id) => [id, tree[id] ?? []]));

  it("takes images and videos at every level, never docs, and marks what is in the app", async () => {
    const found = await walkImages("fc", list, isCreativeMime);
    const out = toDriveCreatives(found, new Set(["vid"]));
    expect(out.map((f) => [f.id, f.kind, f.folder, f.inApp])).toEqual([
      ["img", "image", "", false],
      ["vid", "video", "", true],
      ["mov", "video", "Images", false],
    ]);
  });
});
