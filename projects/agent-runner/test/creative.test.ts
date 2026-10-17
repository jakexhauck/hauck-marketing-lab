import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileApproved, readState, runVideoBlocks, takeVideoBlocks, type CreativeDeps, type CreativeTurn } from "../src/creative.ts";
import { fakeApi, fakeId } from "./fakeApi.ts";

const ID1 = fakeId(1);
import { fakeCreativeApi, fakeExec } from "./fakeCreative.ts";

const F = "```";
const aag = { id: "t-aag", name: "Above All Garage Doors", slug: "above-all-garage-doors", metaAdAccountId: null };

function turn(over: Partial<CreativeDeps> = {}, buildErrors: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "creative-"));
  const workDir = join(root, "work", "creative-above-all-garage-doors");
  const driveDir = join(root, "drive", "AAG");
  mkdirSync(workDir, { recursive: true });
  mkdirSync(driveDir, { recursive: true });
  const c = fakeCreativeApi();
  const e = fakeExec(buildErrors);
  const runnerApi = fakeApi();
  const steps: string[] = [];
  const t: CreativeTurn = {
    deps: { api: c.api, exec: e.x, balance: async () => 100, ...over },
    runnerApi,
    messageId: "m1",
    chatId: "c1",
    tenant: aag,
    workDir,
    driveDir,
    vaultFolder: null,
    say: (s) => steps.push(s),
    log: () => {},
  };
  return { t, c, e, runnerApi, steps, workDir, driveDir };
}

// A prepared clip and a config, as the agent leaves them.
function readyToBuild(workDir: string) {
  for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
    mkdirSync(dirname(join(workDir, f)), { recursive: true });
    writeFileSync(join(workDir, f), "[]");
  }
  mkdirSync(join(workDir, "ads"), { recursive: true });
  writeFileSync(join(workDir, "ads", "ad1.json"), JSON.stringify({ id: "ad1", source: "hey", title: "Ad 1: Hey", segments: [], overlays: [] }));
}

describe("takeVideoBlocks", () => {
  it("takes the blocks out of the answer and drops bad ones", () => {
    const text = [
      "Making a preview now.",
      `${F}video\n{"action": "preview", "config": "ads/ad1.json"}\n${F}`,
      `${F}video\nnot json\n${F}`,
      `${F}video\n[{"action": "prepare", "source": "G:/x.mov", "name": "Bad Name"}, {"action": "photo", "source": "G:/a.jpg", "as": "ba1-before"}]\n${F}`,
    ].join("\n");
    const out = takeVideoBlocks(text);
    expect(out.text).toBe("Making a preview now.");
    expect(out.blocks).toEqual([
      { action: "preview", config: "ads/ad1.json" },
      { action: "photo", source: "G:/a.jpg", as: "ba1-before" },
    ]);
  });
});

describe("runVideoBlocks", () => {
  it("prepares a clip from the Drive folder and asks the agent to go on", async () => {
    const w = turn();
    writeFileSync(join(w.driveDir, "clip.mov"), "raw");
    const out = await runVideoBlocks([{ action: "prepare", source: join(w.driveDir, "clip.mov"), name: "hey" }], w.t, new Set());
    expect(out.again).toBe(true);
    expect(out.notes[0]).toContain('Prepared "hey"');
    expect(existsSync(join(w.workDir, "tx", "hey.json"))).toBe(true);
    expect(existsSync(join(w.workDir, "tx", "hey.txt"))).toBe(true);
    expect(w.e.calls).toContain("npx transcribe");
  });

  it("refuses a source outside the client's Drive folder", async () => {
    const w = turn();
    const out = await runVideoBlocks([{ action: "prepare", source: join(w.driveDir, "..", "Willis", "clip.mov"), name: "hey" }], w.t, new Set());
    expect(out.notes[0]).toMatch(/not in the client's Drive folder/);
    expect(w.e.calls).toEqual([]);
  });

  it("refuses a config outside the work folder", async () => {
    const w = turn();
    const out = await runVideoBlocks([{ action: "preview", config: "../../elsewhere.json" }], w.t, new Set());
    expect(out.notes[0]).toMatch(/outside your work folder/);
  });

  it("renders a preview onto a card, and rewrites that card next time", async () => {
    const w = turn();
    readyToBuild(w.workDir);
    const out = await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, new Set());
    expect(out.again).toBe(false);
    expect(w.c.uploads[0]).toMatchObject({ messageId: "m1", tenantId: "t-aag", type: "video/mp4", preview: true });
    expect(w.runnerApi.items[0]).toMatchObject({ kind: "video", title: "Preview: Ad 1: Hey", status: "needs_ok" });
    expect(w.runnerApi.items[0].payload.previewUrl).toBe("https://store/read/t-aag/previews/p1.mp4");
    expect(w.runnerApi.items[0].payload.grant).toBeUndefined();
    await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, new Set());
    expect(w.runnerApi.items[1].id).toBe(ID1);
  });

  it("puts a final on a file card and remembers what it staged for it", async () => {
    const w = turn();
    readyToBuild(w.workDir);
    await runVideoBlocks([{ action: "final", config: "ads/ad1.json" }], w.t, new Set());
    expect(w.c.uploads[0].preview).toBe(false);
    expect(w.runnerApi.items[0]).toMatchObject({ kind: "creative", status: "needs_ok" });
    expect(w.runnerApi.items[0].payload.grant).toEqual({ kind: "file" });
    expect(w.runnerApi.items[0].payload.path).toBe("t-aag/f1.mp4");
    expect(readState(w.workDir).finals[ID1]).toMatchObject({ path: "t-aag/f1.mp4", name: "ad1.mp4", type: "video/mp4" });
  });

  it("sends a phrase not found back to the agent once, then stops", async () => {
    const w = turn({}, ['phrase not found: "grinds" (after 0)', 'phrase not found: "grinds" (after 0)']);
    readyToBuild(w.workDir);
    const retried = new Set<string>();
    const first = await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, retried);
    expect(first.again).toBe(true);
    expect(first.notes[0]).toContain('phrase not found: "grinds"');
    const second = await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, retried);
    expect(second.again).toBe(false);
    expect(second.notes[0]).toMatch(/failed again/);
    expect(w.runnerApi.items).toEqual([]);
  });

  it("stages only https images of a type Creatives takes", async () => {
    const fetchImpl = (async (url: string) =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": url.endsWith(".png") ? "image/png" : "text/html" } })) as unknown as typeof fetch;
    const w = turn({ fetch: fetchImpl });
    const out = await runVideoBlocks(
      [
        { action: "stage", url: "http://cdn/x.png", name: "a" },
        { action: "stage", url: "https://cdn/page.html", name: "b" },
        { action: "stage", url: "https://cdn/x.png", name: "winter-offer" },
      ],
      w.t,
      new Set(),
    );
    expect(out.notes[0]).toMatch(/only https/);
    expect(out.notes[1]).toMatch(/cannot go into Creatives/);
    expect(w.runnerApi.items).toHaveLength(1);
    expect(w.runnerApi.items[0].payload.thumbs).toEqual(["https://store/read/t-aag/f1.mp4"]);
    expect(readState(w.workDir).finals[ID1]).toMatchObject({ name: "winter-offer.png", type: "image/png" });
  });
});

describe("fileApproved", () => {
  it("files what the runner staged for the approved card", async () => {
    const w = turn();
    readyToBuild(w.workDir);
    await runVideoBlocks([{ action: "final", config: "ads/ad1.json" }], w.t, new Set());
    const note = await fileApproved({ itemId: ID1, kind: "file", limit: null }, w.t);
    expect(note).toBe("Runner: filed ad1.mp4 into Creatives.");
    expect(w.c.filed[0]).toEqual({ messageId: "m1", tenantId: "t-aag", path: "t-aag/f1.mp4", name: "ad1.mp4", type: "video/mp4", size: 1 });
  });

  it("files nothing for a card it did not stage", async () => {
    const w = turn();
    const note = await fileApproved({ itemId: "made-by-the-agent", kind: "file", limit: null }, w.t);
    expect(note).toMatch(/nothing was filed/);
    expect(w.c.filed).toEqual([]);
  });
});
