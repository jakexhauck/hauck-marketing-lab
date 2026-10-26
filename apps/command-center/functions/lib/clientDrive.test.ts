import { describe, expect, it } from "vitest";
import { cleanDriveName, folderPath, newItemMime } from "./clientDrive";

// id -> its own name and parent, a client folder three levels deep.
const meta: Record<string, { name: string; parents: string[] }> = {
  root: { name: "🤝 | Willis Windows", parents: ["clients"] },
  fc: { name: "Finished Creatives", parents: ["root"] },
  mar: { name: "March", parents: ["fc"] },
  other: { name: "🤝 | Made Better", parents: ["clients"] },
  loopA: { name: "A", parents: ["loopB"] },
  loopB: { name: "B", parents: ["loopA"] },
};
const metaOf = async (id: string) => meta[id] ?? null;

describe("folderPath", () => {
  it("is just the root for the root", async () => {
    expect(await folderPath("root", "root", "🤝 | Willis Windows", metaOf)).toEqual([
      { id: "root", name: "🤝 | Willis Windows" },
    ]);
  });

  it("walks up to the root and returns the trail top down", async () => {
    expect(await folderPath("mar", "root", "🤝 | Willis Windows", metaOf)).toEqual([
      { id: "root", name: "🤝 | Willis Windows" },
      { id: "fc", name: "Finished Creatives" },
      { id: "mar", name: "March" },
    ]);
  });

  it("is null for a folder outside the client's folder", async () => {
    expect(await folderPath("other", "root", "x", metaOf)).toBeNull();
  });

  it("is null for a missing id and stops on a parent loop", async () => {
    expect(await folderPath("nope", "root", "x", metaOf)).toBeNull();
    expect(await folderPath("loopA", "root", "x", metaOf)).toBeNull();
  });
});

describe("newItemMime", () => {
  it("maps the New menu to Google's types", () => {
    expect(newItemMime("folder")).toBe("application/vnd.google-apps.folder");
    expect(newItemMime("doc")).toBe("application/vnd.google-apps.document");
    expect(newItemMime("sheet")).toBe("application/vnd.google-apps.spreadsheet");
    expect(newItemMime("slides")).toBe("application/vnd.google-apps.presentation");
  });

  it("is null for anything else", () => {
    expect(newItemMime("exe")).toBeNull();
    expect(newItemMime(undefined)).toBeNull();
  });
});

describe("cleanDriveName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanDriveName("  March   photos ")).toBe("March photos");
  });

  it("is null when blank or not a string", () => {
    expect(cleanDriveName("   ")).toBeNull();
    expect(cleanDriveName(42)).toBeNull();
  });

  it("caps a runaway name", () => {
    expect(cleanDriveName("a".repeat(500))?.length).toBe(255);
  });
});
