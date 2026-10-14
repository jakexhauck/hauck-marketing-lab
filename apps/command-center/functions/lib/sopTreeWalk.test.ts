import { describe, it, expect } from "vitest";
import { buildSopTree, type ListFolders } from "./sopTree";
import type { DriveFile } from "./driveDirect";

// The WALK, as distinct from sopTree.test.ts which pins the filename rules.
//
// What matters here is that reading a level at a time produces the same tree the
// old folder-at-a-time walk did, and costs one call per level rather than one per
// folder. That call count is the entire reason this changed: 32 sequential reads
// through Composio's shared quota is what came back 429.

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const PDF = "application/pdf";

function file(id: string, name: string, mimeType: string): DriveFile {
  return {
    id,
    name,
    mimeType,
    isFolder: mimeType === FOLDER,
    webViewLink: `https://drive.google.com/file/d/${id}`,
    iconLink: null,
    thumbnailLink: null,
    modifiedTime: "2026-07-29T00:00:00Z",
    size: null,
  };
}

/** A fake Drive that records every batch it was asked for. */
function drive(folders: Record<string, DriveFile[]>) {
  const batches: string[][] = [];
  const list: ListFolders = async (ids) => {
    batches.push([...ids]);
    const out = new Map<string, DriveFile[]>();
    // Answers for every id asked, empty when the folder has nothing, which is
    // the contract the walk relies on.
    for (const id of ids) out.set(id, folders[id] ?? []);
    return out;
  };
  return { list, batches, get calls() { return batches.length; } };
}

describe("buildSopTree", () => {
  it("reads one batch per level, not one call per folder", async () => {
    const d = drive({
      root: [file("a", "Acquisition", FOLDER), file("b", "Fullfillment", FOLDER)],
      a: [file("a1", "Cold Email", FOLDER), file("d1", "1. Dialling SOP", DOC)],
      b: [file("b1", "Facebook Ads", FOLDER)],
      a1: [file("d2", "1. Day One", DOC)],
      b1: [file("d3", "2. Pixel SOP", DOC)],
    });

    await buildSopTree(d.list, "root");

    // Root, then level 1 (a + b together), then level 2 (a1 + b1 together).
    // Folder-at-a-time would have been five.
    expect(d.calls).toBe(3);
    expect(d.batches[0]).toEqual(["root"]);
    expect(d.batches[1]).toEqual(["a", "b"]);
    expect(d.batches[2]).toEqual(["a1", "b1"]);
  });

  it("nests folders as Drive has them and keeps Drive's ordering", async () => {
    const d = drive({
      root: [file("a", "Acquisition", FOLDER), file("b", "Fullfillment", FOLDER)],
      a: [file("a1", "Cold Email", FOLDER)],
      a1: [file("d2", "1. Day One", DOC)],
      b: [],
    });

    const tree = await buildSopTree(d.list, "root");

    expect(tree.folders.map((f) => f.name)).toEqual(["Acquisition", "Fullfillment"]);
    expect(tree.folders[0].folders[0].name).toBe("Cold Email");
    expect(tree.folders[0].folders[0].sops.map((s) => s.title)).toEqual(["Day One"]);
    // The trail is the folders ABOVE this one, so a nested SOP can say where it lives.
    expect(tree.folders[0].folders[0].trail).toEqual(["Acquisition"]);
    expect(tree.folders[0].folders[0].key).toBe("acquisition/cold-email");
  });

  it("keeps an empty folder, because it is structure Jake made", async () => {
    const d = drive({ root: [file("a", "Empty Shelf", FOLDER)], a: [] });
    const tree = await buildSopTree(d.list, "root");
    expect(tree.folders.map((f) => f.name)).toEqual(["Empty Shelf"]);
    expect(tree.folders[0].totalSops).toBe(0);
  });

  it("counts SOPs and files from the whole subtree", async () => {
    const d = drive({
      root: [file("a", "Acquisition", FOLDER)],
      a: [file("a1", "Cold Email", FOLDER), file("d1", "1. Dialling SOP", DOC)],
      a1: [file("d2", "1. Day One", DOC), file("p1", "Script.pdf", PDF)],
    });

    const tree = await buildSopTree(d.list, "root");

    expect(tree.folders[0].totalSops).toBe(2);
    expect(tree.folders[0].totalFiles).toBe(1);
  });

  it("puts loose root Docs at the top level rather than in an invented folder", async () => {
    const d = drive({
      root: [file("a", "Acquisition", FOLDER), file("d0", "1. Read Me First", DOC)],
      a: [],
    });

    const tree = await buildSopTree(d.list, "root");

    expect(tree.sops.map((s) => s.title)).toEqual(["Read Me First"]);
    expect(tree.folders.map((f) => f.name)).toEqual(["Acquisition"]);
  });

  it("skips the client scaffolding folder", async () => {
    const d = drive({
      root: [file("a", "Example Client Folder", FOLDER), file("b", "Fullfillment", FOLDER)],
      b: [],
    });

    const tree = await buildSopTree(d.list, "root");

    expect(tree.folders.map((f) => f.name)).toEqual(["Fullfillment"]);
    // Never even asked Drive about it.
    expect(d.batches.flat()).not.toContain("a");
  });

  it("terminates on a shortcut loop instead of spinning", async () => {
    // b lists a as a child, and a lists b: a cycle a depth bound alone would
    // survive but never leave.
    const d = drive({
      root: [file("a", "Acquisition", FOLDER)],
      a: [file("b", "Fullfillment", FOLDER)],
      b: [file("a", "Acquisition", FOLDER)],
    });

    const tree = await buildSopTree(d.list, "root");

    expect(tree.folders[0].name).toBe("Acquisition");
    expect(tree.folders[0].folders[0].name).toBe("Fullfillment");
    // The second sighting of "a" is dropped, not walked again.
    expect(tree.folders[0].folders[0].folders).toEqual([]);
  });

  it("stops at the depth bound but still reads the folder it stops on", async () => {
    // Seven levels; MAX_DEPTH is 6.
    const chain: Record<string, DriveFile[]> = {
      root: [file("f1", "L1", FOLDER)],
    };
    for (let i = 1; i <= 7; i++) {
      chain[`f${i}`] = [
        file(`d${i}`, `1. SOP ${i}`, DOC),
        ...(i < 7 ? [file(`f${i + 1}`, `L${i + 1}`, FOLDER)] : []),
      ];
    }
    const d = drive(chain);

    const tree = await buildSopTree(d.list, "root");

    let node = tree.folders[0];
    let depth = 1;
    while (node.folders.length > 0) {
      node = node.folders[0];
      depth++;
    }
    expect(depth).toBe(6);
    // The deepest folder reached still contributes its own SOP.
    expect(node.sops.map((s) => s.title)).toEqual(["SOP 6"]);
  });

  it("survives a folder the lister has no entry for", async () => {
    const d = drive({ root: [file("a", "Acquisition", FOLDER)] });
    const tree = await buildSopTree(d.list, "root");
    expect(tree.folders[0].sops).toEqual([]);
  });
});
