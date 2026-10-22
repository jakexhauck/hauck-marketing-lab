import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultBundleEnv, stateDirFor, workDirFor, type BundleEnv } from "../src/bundle.ts";
import type { CreativeApi } from "../src/creativeApi.ts";
import type { CreativeTurn } from "../src/creative.ts";
import { fromDriveRef, remoteVideoBlocks, toDriveRef, workOnePcJob } from "../src/pcJobs.ts";
import { takeVideoBlocks } from "../src/creative.ts";
import type { PcJob, PcJobBody } from "../src/wire.ts";
import { fakeApi } from "./fakeApi.ts";
import { fakeCreativeApi, fakeExec } from "./fakeCreative.ts";

const aag = { id: "t-aag", name: "Above All Garage Doors", slug: "above-all-garage-doors", metaAdAccountId: null };
// As the G: mount shows it (no pipe: Windows will not take one).
const DRIVE_FOLDER = "\u{1F91D} Above All Garage Doors";

// The app's pc-job route, in memory (lib/agentPcJobs.ts has the real rules).
function jobStore() {
  const jobs: PcJob[] = [];
  let n = 0;
  const pcJob = async (b: PcJobBody): Promise<PcJob | null> => {
    if (b.action === "create") {
      const job: PcJob = { id: `j${++n}`, messageId: b.messageId, tenantId: b.tenantId, kind: "video", payload: JSON.parse(JSON.stringify(b.payload)), status: "queued", host: null, step: null, result: null, error: null };
      jobs.push(job);
      return { ...job };
    }
    if (b.action === "claim") {
      const job = jobs.find((j) => j.status === "queued");
      if (!job) return null;
      Object.assign(job, { status: "running", host: b.host, step: "Claimed" });
      return JSON.parse(JSON.stringify(job));
    }
    const job = jobs.find((j) => j.id === b.id);
    if (!job) return null;
    if (b.action === "step") job.step = b.step;
    if (b.action === "finish") Object.assign(job, b.error ? { status: "error", error: b.error } : { status: "done", result: JSON.parse(JSON.stringify(b.result)) });
    if (b.action === "cancel" && !(b.ifStatus && job.status !== b.ifStatus) && (job.status === "queued" || job.status === "running")) job.status = "cancelled";
    return JSON.parse(JSON.stringify(job));
  };
  return { jobs, pcJob };
}

// One machine's folders: a vault, an agency Drive root with the client's
// folder, and the runner's work and state roots.
function machine(name: string): BundleEnv & { drive: string } {
  const root = mkdtempSync(join(tmpdir(), `pcjob-${name}-`));
  const driveRoot = join(root, "drive");
  const drive = join(driveRoot, DRIVE_FOLDER);
  mkdirSync(drive, { recursive: true });
  return { ...defaultBundleEnv(), vaultDir: join(root, "vault"), driveRoot, workRoot: join(root, "work"), stateRoot: join(root, "state"), drive };
}

function vpsTurn(env: BundleEnv & { drive: string }, api: CreativeApi, steps: string[]): CreativeTurn {
  const workDir = workDirFor(env, "ads", aag);
  mkdirSync(workDir, { recursive: true });
  return {
    deps: { api, exec: fakeExec().x, balance: async () => 100 },
    runnerApi: fakeApi(),
    messageId: "m1",
    chatId: "c1",
    tenant: aag,
    workDir,
    stateDir: stateDirFor(env, "ads", aag),
    driveDir: env.drive,
    vaultFolder: null,
    say: (s) => steps.push(s),
    log: () => {},
  };
}

describe("video blocks bound for the PC", () => {
  it("only name an ad config by its usual path", () => {
    const F = "```";
    const text = [`${F}video`, JSON.stringify([
      { action: "preview", config: ".claude/settings.json" },
      { action: "final", config: "ads/../x.json" },
      { action: "preview", config: "ads/ad-2.json" },
    ]), F].join("\n");
    expect(takeVideoBlocks(text).blocks).toEqual([{ action: "preview", config: "ads/ad-2.json" }]);
  });
});

describe("drive refs", () => {
  it("sends a Drive path relative and rebuilds it under the other root", () => {
    const vps = machine("a");
    const pc = machine("b");
    const ref = toDriveRef(vps.driveRoot, join(vps.drive, "raw", "clip.mov"));
    expect(ref).toBe(`drive:${DRIVE_FOLDER}/raw/clip.mov`);
    expect(fromDriveRef(pc.driveRoot, ref)).toBe(join(pc.drive, "raw", "clip.mov"));
  });

  it("leaves names and paths outside the Drive root alone, and never climbs out", () => {
    const vps = machine("a");
    expect(toDriveRef(vps.driveRoot, "hey-im-ryan")).toBe("hey-im-ryan");
    expect(toDriveRef(vps.driveRoot, "/etc/passwd")).toBe("/etc/passwd");
    expect(() => fromDriveRef(vps.driveRoot, "drive:../../etc/passwd")).toThrow(/not inside/);
  });
});

describe("remoteVideoBlocks with the PC worker", () => {
  it("runs a prepare on the PC and brings the transcript back to the VPS work folder", async () => {
    const vps = machine("vps");
    const pc = machine("pc");
    writeFileSync(join(pc.drive, "clip.mov"), "raw");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const steps: string[] = [];
    const t = vpsTurn(vps, api, steps);
    const pcExec = fakeExec();
    let worked = false;
    const run = remoteVideoBlocks({
      api,
      driveRoot: vps.driveRoot,
      pollMs: 1,
      // The PC takes the job while the VPS waits.
      sleep: async () => {
        if (!worked) {
          worked = true;
          await workOnePcJob({ api, runnerApi: fakeApi(), creative: { api, exec: pcExec.x, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
        }
      },
    });
    const out = await run([{ action: "prepare", source: join(vps.drive, "clip.mov"), name: "hey" }], t, new Set());
    expect(out.again).toBe(true);
    expect(out.notes[0]).toContain('Prepared "hey"');
    expect(pcExec.calls).toContain("npx transcribe");
    expect(existsSync(join(t.workDir, "tx", "hey.txt"))).toBe(true);
    expect(store.jobs[0].payload.blocks).toEqual([{ action: "prepare", source: `drive:${DRIVE_FOLDER}/clip.mov`, name: "hey" }]);
    expect(steps[0]).toBe("Waiting for the PC");
  });

  it("sends the config the agent wrote and keeps the PC's creative state", async () => {
    const vps = machine("vps");
    const pc = machine("pc");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const t = vpsTurn(vps, api, []);
    mkdirSync(join(t.workDir, "ads"), { recursive: true });
    writeFileSync(join(t.workDir, "ads", "ad1.json"), JSON.stringify({ id: "ad1", source: "hey", title: "Ad 1", freezeFrom: join(vps.drive, "still.mov") }));
    // The clip was prepared on the PC earlier.
    const pcState = stateDirFor(pc, "ads", aag);
    for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
      mkdirSync(join(pcState, "prepared", f, ".."), { recursive: true });
      writeFileSync(join(pcState, "prepared", f), "[]");
    }
    const runnerApi = fakeApi();
    let worked = false;
    const run = remoteVideoBlocks({
      api,
      driveRoot: vps.driveRoot,
      pollMs: 1,
      sleep: async () => {
        if (!worked) {
          worked = true;
          await workOnePcJob({ api, runnerApi, creative: { api, exec: fakeExec().x, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
        }
      },
    });
    const out = await run([{ action: "final", config: "ads/ad1.json" }], t, new Set());
    expect(out.notes.join(" ")).toMatch(/final of ad1 is on its card/);
    const sent = JSON.parse(readFileSync(join(workDirFor(pc, "ads", aag), "ads", "ad1.json"), "utf8"));
    expect(sent.freezeFrom).toBe(join(pc.drive, "still.mov"));
    // What the PC staged for filing is now in the VPS's state, where the Approve turn reads it.
    const state = JSON.parse(readFileSync(join(t.stateDir, "creative-state.json"), "utf8"));
    expect(Object.values(state.finals)).toHaveLength(1);
  });

  it("stages a Higgsfield result on the VPS without the PC", async () => {
    const vps = machine("vps");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const t = vpsTurn(vps, api, []);
    t.deps.fetch = (async () => new Response("img", { headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
    const out = await remoteVideoBlocks({ api, driveRoot: vps.driveRoot, pollMs: 1, sleep: async () => {} })([{ action: "stage", url: "https://cdn.higgsfield.ai/x.png", name: "door-1" }], t, new Set());
    expect(out.notes[0]).toMatch(/door-1" is on a card/);
    expect(store.jobs).toEqual([]);
  });

  it("tells the agent the PC is off when nobody takes the job, and cancels it", async () => {
    const vps = machine("vps");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const t = vpsTurn(vps, api, []);
    let clock = 0;
    const out = await remoteVideoBlocks({ api, driveRoot: vps.driveRoot, pollMs: 1, claimWaitMs: 1000, now: () => clock, sleep: async () => void (clock += 600) })(
      [{ action: "preview", config: "ads/ad1.json" }],
      t,
      new Set(),
    );
    expect(out.notes[0]).toMatch(/PC is off/);
    expect(out.again).toBe(false);
    expect(store.jobs[0].status).toBe("cancelled");
  });

  it("writes only ad configs and the brand file on the PC, for the client the app names", async () => {
    const pc = machine("pc");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    // What a VPS that was taken over could send.
    await store.pcJob({
      action: "create",
      messageId: "m1",
      tenantId: "t-aag",
      payload: {
        tenant: { id: "t-aag", slug: "x/../../evil", name: "Evil" },
        files: [
          { rel: ".claude/settings.json", content: "{}" },
          { rel: "ads/../../escape.json", content: "{}" },
          { rel: "CLAUDE.md", content: "x" },
          { rel: "ads/ad1.json", content: "{}" },
        ],
        blocks: [],
      },
    });
    await workOnePcJob({ api, runnerApi: fakeApi(), creative: { api, exec: fakeExec().x, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
    const work = workDirFor(pc, "ads", aag);
    expect(existsSync(join(work, "ads", "ad1.json"))).toBe(true);
    expect(existsSync(join(work, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(work, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(work, "..", "escape.json"))).toBe(false);
    expect(store.jobs[0].status).toBe("done");
  });

  it("refuses a job for a client the app does not list", async () => {
    const pc = machine("pc");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    await store.pcJob({ action: "create", messageId: "m1", tenantId: "t-other", payload: { blocks: [] } });
    await workOnePcJob({ api, runnerApi: fakeApi(), creative: { api, exec: fakeExec().x, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
    expect(store.jobs[0]).toMatchObject({ status: "error", error: expect.stringMatching(/not in the app's client list/) });
  });

  it("keeps waiting when the PC took the job just as the VPS gave up on it", async () => {
    const vps = machine("vps");
    const store = jobStore();
    const c = fakeCreativeApi();
    const real = store.pcJob;
    // The PC claims it in the instant between the last poll and the cancel.
    const api: CreativeApi = {
      ...c.api,
      pcJob: async (b) => {
        if (b.action === "cancel") {
          const j = store.jobs[0];
          if (j.status === "queued") Object.assign(j, { status: "running", host: "pc", step: "Claimed" });
          return { ...j };
        }
        return real(b);
      },
    };
    const t = vpsTurn(vps, api, []);
    let clock = 0;
    let polls = 0;
    const out = await remoteVideoBlocks({
      api,
      driveRoot: vps.driveRoot,
      pollMs: 1,
      claimWaitMs: 1000,
      now: () => clock,
      sleep: async () => {
        clock += 600;
        polls++;
        if (polls === 5) Object.assign(store.jobs[0], { status: "done", result: { notes: ["The preview of ad1 is on its card."], again: false } });
      },
    })([{ action: "preview", config: "ads/ad1.json" }], t, new Set());
    expect(out.notes).toEqual(["The preview of ad1 is on its card."]);
  });

  it("stops before uploading once the VPS has cancelled", async () => {
    const pc = machine("pc");
    const store = jobStore();
    const c = fakeCreativeApi();
    const real = store.pcJob;
    const api: CreativeApi = {
      ...c.api,
      pcJob: async (b) => {
        // The VPS gave up: every step is refused from now on.
        if (b.action === "step") throw new Error("POST pc-job 409: job is cancelled");
        return real(b);
      },
    };
    const pcState = stateDirFor(pc, "ads", aag);
    for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
      mkdirSync(join(pcState, "prepared", f, ".."), { recursive: true });
      writeFileSync(join(pcState, "prepared", f), "[]");
    }
    await store.pcJob({
      action: "create",
      messageId: "m1",
      tenantId: "t-aag",
      payload: { files: [{ rel: "ads/ad1.json", content: JSON.stringify({ id: "ad1", source: "hey" }) }], blocks: [{ action: "preview", config: "ads/ad1.json" }] },
    });
    await workOnePcJob({ api, runnerApi: fakeApi(), creative: { api, exec: fakeExec().x, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
    expect(c.uploads).toEqual([]);
  });

  it("uploads nothing when the VPS cancels while the PC is rendering", async () => {
    const pc = machine("pc");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const pcState = stateDirFor(pc, "ads", aag);
    for (const f of ["proxies/hey.mp4", "tx/hey.json"]) {
      mkdirSync(join(pcState, "prepared", f, ".."), { recursive: true });
      writeFileSync(join(pcState, "prepared", f), "[]");
    }
    const e = fakeExec();
    const exec: typeof e.x = async (cmd, args) => {
      if (cmd === "npx" && args[2] === "render") await store.pcJob({ action: "cancel", id: "j1" });
      return e.x(cmd, args);
    };
    await store.pcJob({
      action: "create",
      messageId: "m1",
      tenantId: "t-aag",
      payload: { files: [{ rel: "ads/ad1.json", content: JSON.stringify({ id: "ad1", source: "hey" }) }], blocks: [{ action: "final", config: "ads/ad1.json" }] },
    });
    const runnerApi = fakeApi();
    await workOnePcJob({ api, runnerApi, creative: { api, exec, balance: async () => 100 }, env: pc, host: "pc", log: () => {}, tenants: async () => [aag] });
    expect(e.calls).toContain("npx render");
    expect(c.uploads).toEqual([]);
  });

  it("reports a PC failure to the agent", async () => {
    const vps = machine("vps");
    const store = jobStore();
    const c = fakeCreativeApi();
    const api: CreativeApi = { ...c.api, pcJob: store.pcJob };
    const t = vpsTurn(vps, api, []);
    const out = await remoteVideoBlocks({
      api,
      driveRoot: vps.driveRoot,
      pollMs: 1,
      sleep: async () => {
        const j = store.jobs[0];
        if (j.status === "queued") Object.assign(j, { status: "error", error: "ffmpeg died" });
      },
    })([{ action: "photo", source: join(vps.drive, "a.jpg"), as: "ba1" }], t, new Set());
    expect(out.notes[0]).toBe("photo failed on the PC: ffmpeg died");
    expect(out.again).toBe(true);
  });
});
