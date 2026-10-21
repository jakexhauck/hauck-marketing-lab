import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileApproved, readState, runVideoBlocks, takeVideoBlocks, type CreativeDeps, type CreativeTurn } from "../src/creative.ts";
import { fakeApi, fakeId } from "./fakeApi.ts";

const ID1 = fakeId(1);
import { fakeCreativeApi, fakeExec } from "./fakeCreative.ts";
import { inside } from "../src/video.ts";

const F = "```";
const aag = { id: "t-aag", name: "Above All Garage Doors", slug: "above-all-garage-doors", metaAdAccountId: null };

function turn(over: Partial<CreativeDeps> = {}, buildErrors: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "creative-"));
  const workDir = join(root, "work", "ads-above-all-garage-doors");
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
    stateDir: join(root, "state", "ads-above-all-garage-doors"),
    driveDir,
    vaultFolder: null,
    say: (s) => steps.push(s),
    log: () => {},
  };
  return { t, c, e, runnerApi, steps, workDir, driveDir };
}

// A prepared clip (the runner's own copies, in its state folder) and a
// config, as the agent leaves it.
function readyToBuild(workDir: string, stateDir = join(workDir, "..", "..", "state", "ads-above-all-garage-doors")) {
  for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
    mkdirSync(dirname(join(stateDir, "prepared", f)), { recursive: true });
    writeFileSync(join(stateDir, "prepared", f), "[]");
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
    // What a build reads stays the runner's: the agent gets copies to read.
    expect(existsSync(join(w.workDir, "proxies", "hey.mp4"))).toBe(false);
    expect(existsSync(join(w.t.stateDir, "prepared", "proxies", "hey.mp4"))).toBe(true);
    expect(existsSync(join(w.t.stateDir, "prepared", "tx", "hey.json"))).toBe(true);
    expect(w.e.calls).toContain("npx transcribe");
  });

  it("refuses a source outside the client's Drive folder", async () => {
    const w = turn();
    const out = await runVideoBlocks([{ action: "prepare", source: join(w.driveDir, "..", "Willis", "clip.mov"), name: "hey" }], w.t, new Set());
    expect(out.notes[0]).toMatch(/not in the client's Drive folder/);
    expect(w.e.calls).toEqual([]);
  });

  it("builds from the runner's prepared copies, never a proxy the agent wrote", async () => {
    const w = turn();
    // The agent's own files only: not prepared.
    for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
      mkdirSync(dirname(join(w.workDir, f)), { recursive: true });
      writeFileSync(join(w.workDir, f), "[]");
    }
    mkdirSync(join(w.workDir, "ads"), { recursive: true });
    writeFileSync(join(w.workDir, "ads", "ad1.json"), JSON.stringify({ id: "ad1", source: "hey", segments: [], overlays: [] }));
    const out = await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, new Set());
    expect(out.notes[0]).toMatch(/not prepared/);

    readyToBuild(w.workDir, w.t.stateDir);
    const seen: string[][] = [];
    const inner = w.t.deps.exec;
    w.t.deps.exec = async (cmd, args, o) => (cmd === process.execPath && seen.push(args), inner(cmd, args, o));
    await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, new Set());
    const args = seen[0];
    expect(args[args.indexOf("--proxy") + 1]).toBe(join(w.t.stateDir, "prepared", "proxies", "hey.mp4"));
    expect(args[args.indexOf("--transcript") + 1]).toBe(join(w.t.stateDir, "prepared", "tx", "hey.json"));
  });

  it("builds and renders in the runner's own folder, npx in an empty one, whatever the agent planted", async () => {
    const w = turn();
    readyToBuild(w.workDir, w.t.stateDir);
    for (const dir of [w.workDir, join(w.workDir, "videos", "ad1")]) {
      mkdirSync(join(dir, "node_modules", "hyperframes"), { recursive: true });
      writeFileSync(join(dir, ".npmrc"), "registry=https://evil\n");
      writeFileSync(join(dir, "node_modules", "hyperframes", "index.js"), "evil()");
    }
    const npx: { args: string[]; cwd?: string; files: string[] }[] = [];
    const builds: string[][] = [];
    const inner = w.t.deps.exec;
    w.t.deps.exec = async (cmd, args, o) => {
      if (cmd === "npx") npx.push({ args, cwd: o?.cwd, files: o?.cwd && existsSync(o.cwd) ? readdirSync(o.cwd) : ["(missing)"] });
      if (cmd === process.execPath) builds.push(args);
      return inner(cmd, args, o);
    };
    await runVideoBlocks([{ action: "final", config: "ads/ad1.json" }], w.t, new Set());
    expect(npx).toHaveLength(1);
    expect(npx[0].cwd && inside(npx[0].cwd, w.workDir)).toBe(false);
    expect(npx[0].files).toEqual([]);
    const project = npx[0].args[3];
    expect(inside(project, w.t.stateDir)).toBe(true);
    expect(builds[0][builds[0].indexOf("--out") + 1]).toBe(project);
    // The config is a runner copy too, not the agent's file.
    expect(inside(builds[0][1], w.t.stateDir)).toBe(true);
  });

  it("refuses a freeze frame read from outside the Drive folder", async () => {
    const w = turn();
    readyToBuild(w.workDir, w.t.stateDir);
    writeFileSync(
      join(w.workDir, "ads", "ad1.json"),
      JSON.stringify({ id: "ad1", source: "hey", freezeFrom: "C:/Users/games/.claude/.credentials.json", segments: [], overlays: [] }),
    );
    const out = await runVideoBlocks([{ action: "preview", config: "ads/ad1.json" }], w.t, new Set());
    expect(out.notes[0]).toMatch(/freezeFrom/);
    expect(w.e.calls.some((c) => c.startsWith("node"))).toBe(false);
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
    expect(w.runnerApi.items.map((i) => i.origin)).toEqual(["runner", "runner"]);
  });

  it("puts a final on a file card and remembers what it staged for it", async () => {
    const w = turn();
    readyToBuild(w.workDir);
    await runVideoBlocks([{ action: "final", config: "ads/ad1.json" }], w.t, new Set());
    expect(w.c.uploads[0].preview).toBe(false);
    expect(w.runnerApi.items[0]).toMatchObject({ kind: "creative", status: "needs_ok" });
    expect(w.runnerApi.items[0].payload.grant).toEqual({ kind: "file" });
    expect(w.runnerApi.items[0].origin).toBe("runner");
    expect(existsSync(join(w.workDir, "creative-state.json"))).toBe(false);
    expect(existsSync(join(w.workDir, "brand.resolved.json"))).toBe(false);
    expect(w.runnerApi.items[0].payload.path).toBe("t-aag/f1.mp4");
    expect(readState(w.t.stateDir).finals[ID1]).toMatchObject({ path: "t-aag/f1.mp4", name: "ad1.mp4", type: "video/mp4" });
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
    expect(readState(w.t.stateDir).finals[ID1]).toMatchObject({ name: "winter-offer.png", type: "image/png" });
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
