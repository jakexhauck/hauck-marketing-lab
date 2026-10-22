// Clip video work between the VPS and the PC (docs/build-plans/hermes-ads.md).
//
// The Ads Agent answers from the VPS, which cannot render video. Its ```video
// blocks are split: "stage" (fetch a finished Higgsfield file, upload it) runs
// right there; "prepare", "photo", "preview" and "final" go to the PC as one
// job (app: api/agent-runner/pc-job, lib/agentPcJobs.ts). The VPS turn waits
// on it, shows each step the PC reports, and carries on with what came back,
// exactly as if the work had run beside it (creative.ts runVideoBlocks).
//
// Neither side trusts the other. A Drive path in a block or config is sent
// relative to the agency Drive root and rebuilt under the PC's own mount. The
// PC takes the client from the app's own list by the job's tenant id, never
// from the payload. Files travel only under fixed names (ad configs and the
// brand file one way, transcripts the other), each written with within(); a
// file the agent wrote anywhere else in its work folder never crosses. And
// the PC still runs every check runVideoBlocks always ran.
//
// What travels:
//   VPS -> PC   the blocks, the ad configs they name and brand/brand.json
//               (the agent writes those on the VPS), the creative state
//               (which card is which clip's preview, what is staged for
//               filing) and the build retries already used
//   PC -> VPS   the notes, whether the agent needs another round, the
//               transcripts it should read next (tx/), and the new state
//
// Stills stay on the PC: the agent's file tools read text only.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { RunnerApi } from "./api.ts";
import type { BundleEnv } from "./bundle.ts";
import { stateDirFor, workDirFor } from "./bundle.ts";
import { findDriveFolder, vaultFolder } from "./clients.ts";
import { readState, runVideoBlocks, type CreativeDeps, type CreativeTurn, type VideoBlock } from "./creative.ts";
import type { CreativeApi } from "./creativeApi.ts";
import { within } from "./paths.ts";
import type { ClaimTenant, PcJob } from "./wire.ts";

type Outcome = { notes: string[]; again: boolean };

const DRIVE_TAG = "drive:";
const MAX_FILE = 300_000;

export interface RemoteOptions {
  api: CreativeApi;
  // The VPS's Drive mirror root, so Drive paths can travel relative to it.
  driveRoot: string;
  pollMs?: number;
  // How long a job may sit unclaimed before the PC is taken to be off.
  claimWaitMs?: number;
  // How long a claimed job may go without finishing (a dead PC mid-render).
  runMaxMs?: number;
  // How often an unchanged step is shown again, so a long render does not
  // read as a dead runner (the app's STALE_SECONDS is 10 minutes).
  refreshMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const fwd = (p: string) => p.split("\\").join("/");

/** v with every string in it passed through map. */
function mapPaths(v: unknown, map: (s: string) => string): unknown {
  if (typeof v === "string") return map(v);
  if (Array.isArray(v)) return v.map((x) => mapPaths(x, map));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapPaths(x, map)]));
  return v;
}

/** An absolute path inside root, as "drive:<relative>"; anything else as it was. */
export function toDriveRef(root: string, p: string): string {
  if (!isAbsolute(p)) return p;
  const rel = relative(resolve(root), resolve(p));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return p;
  return DRIVE_TAG + fwd(rel);
}

/** "drive:<relative>" back to a path under this machine's Drive root. */
export function fromDriveRef(root: string, s: string): string {
  if (!s.startsWith(DRIVE_TAG)) return s;
  return within(root, ...s.slice(DRIVE_TAG.length).split("/"));
}

const isLocal = (b: VideoBlock) => b.action === "stage";

function readSmall(file: string): string | null {
  try {
    return statSync(file).size <= MAX_FILE ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

// The only files that cross, by name. The PC's work folder is also where a
// claude turn would run, so nothing else (a .claude/settings.json, say) may
// ever be written there from the VPS.
export const TO_PC = /^(?:brand\/brand\.json|ads\/[a-z0-9][a-z0-9-]*\.json)$/;
export const TO_VPS = /^tx\/[a-z0-9][a-z0-9-]*\.(?:json|txt)$/;

function writeFiles(workDir: string, files: unknown, allow: RegExp): void {
  if (!Array.isArray(files)) return;
  for (const f of files as { rel?: unknown; content?: unknown }[]) {
    if (typeof f?.rel !== "string" || !allow.test(f.rel)) continue;
    if (typeof f?.content !== "string" || f.content.length > MAX_FILE) continue;
    const dest = within(workDir, ...f.rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
  }
}

function writeStateFile(stateDir: string, state: unknown): void {
  if (!state || typeof state !== "object") return;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "creative-state.json"), JSON.stringify(state, null, 2) + "\n");
}

const what = (blocks: VideoBlock[]) => [...new Set(blocks.map((b) => b.action))].join(", ");

/**
 * The VPS's runVideoBlocks: stage here, the rest on the PC. Same contract, so
 * the creative rounds in runner.ts do not care where the work ran.
 */
export function remoteVideoBlocks(o: RemoteOptions): NonNullable<CreativeDeps["runBlocks"]> {
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const pollMs = o.pollMs ?? 3_000;
  return async (blocks, t, retried) => {
    const out: Outcome = { notes: [], again: false };
    const here = blocks.filter(isLocal);
    const there = blocks.filter((b) => !isLocal(b));
    if (here.length) {
      const r = await runVideoBlocks(here, t, retried);
      out.notes.push(...r.notes);
      out.again ||= r.again;
    }
    if (!there.length) return out;

    // What the PC needs from this side: the configs the blocks name and the
    // brand file, both written by the agent here.
    const files: { rel: string; content: string }[] = [];
    const want = new Set<string>(["brand/brand.json"]);
    for (const b of there) if (b.action === "preview" || b.action === "final") want.add(fwd(b.config));
    for (const rel of want) {
      if (!TO_PC.test(rel)) continue;
      let file: string;
      try {
        file = within(t.workDir, ...rel.split("/"));
      } catch {
        continue;
      }
      const content = readSmall(file);
      if (content !== null) files.push({ rel: fwd(relative(t.workDir, file)), content });
    }
    // Drive paths inside a config (freezeFrom) travel relative too.
    const toRef = (s: string) => toDriveRef(o.driveRoot, s);
    const configs = files.map((f) => {
      if (!f.rel.endsWith(".json")) return f;
      try {
        return { ...f, content: JSON.stringify(mapPaths(JSON.parse(f.content), toRef), null, 2) };
      } catch {
        return f;
      }
    });

    const payload = {
      blocks: mapPaths(there, toRef),
      files: configs,
      state: readState(t.stateDir),
      retried: [...retried],
      chatId: t.chatId,
    } as Record<string, unknown>;

    let job: PcJob | null;
    try {
      job = await o.api.pcJob({ action: "create", messageId: t.messageId, tenantId: t.tenant.id, payload });
    } catch (e) {
      out.notes.push(`${what(there)} could not be sent to the PC: ${(e as Error).message}`);
      return out;
    }
    if (!job) {
      out.notes.push(`${what(there)} could not be sent to the PC.`);
      return out;
    }
    t.say("Waiting for the PC");

    // Time waiting only counts on polls that got an answer: a network blip on
    // this side is not the PC being off. A hard deadline still ends the wait
    // whatever the polls say, and a job the app no longer has (404) is final.
    const claimWait = o.claimWaitMs ?? 90_000;
    const runMax = o.runMaxMs ?? 45 * 60_000;
    const deadline = now() + claimWait + runMax + 5 * 60_000;
    let waited = 0;
    let last = now();
    let claimedAt: number | null = null;
    let lastStep = "";
    let shownAt = now();
    const offNote = `Jake's PC is off or not taking video work, so ${what(there)} did not run. Tell Jake; ask again once the PC is on.`;
    const lostNote = `The PC stopped answering during ${what(there)}, so it did not finish. Tell Jake.`;
    for (;;) {
      await sleep(pollMs);
      let cur: PcJob | null;
      try {
        cur = await o.api.pcJob({ action: "get", id: job.id });
      } catch (e) {
        if (/\b404\b/.test((e as Error).message)) {
          out.notes.push(`${what(there)} stopped: the job is gone from the app.`);
          return out;
        }
        t.log(`pc job poll failed: ${(e as Error).message}`);
        cur = null;
      }
      const at = now();
      if (cur?.status === "queued") waited += at - last;
      last = at;
      if (cur?.status === "running" && claimedAt === null) claimedAt = at;
      // Out of time. An unclaimed job is cancelled only while still unclaimed:
      // a PC that took it that same moment is waited for, not reported as off.
      const queuedTooLong = cur?.status === "queued" && waited > claimWait;
      const runTooLong = (cur?.status === "running" && claimedAt !== null && at - claimedAt > runMax) || at > deadline;
      if (queuedTooLong || runTooLong) {
        const after = await o.api
          .pcJob({ action: "cancel", id: job.id, ...(queuedTooLong && !runTooLong ? { ifStatus: "queued" as const } : {}) })
          .catch(() => null);
        if (after?.status === "running" && !runTooLong) {
          cur = after;
          claimedAt ??= at;
        } else if (after?.status === "done" || after?.status === "error") {
          cur = after;
        } else {
          out.notes.push(queuedTooLong && !runTooLong ? offNote : lostNote);
          return out;
        }
      }
      if (cur?.status === "done") {
        const r = cur.result ?? {};
        writeFiles(t.workDir, r.files, TO_VPS);
        writeStateFile(t.stateDir, r.state);
        if (Array.isArray(r.retried)) for (const id of r.retried) if (typeof id === "string") retried.add(id);
        out.notes.push(...(Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === "string") : []));
        out.again ||= r.again === true;
        return out;
      }
      if (cur?.status === "error" || cur?.status === "cancelled") {
        out.notes.push(`${what(there)} failed on the PC: ${cur.error ?? cur.status}`);
        out.again = true;
        return out;
      }
      const step = cur?.step ?? "";
      if (cur?.status === "running" && step && (step !== lastStep || at - shownAt > (o.refreshMs ?? 120_000))) {
        t.say(step === "Claimed" ? "The PC took the video work" : step);
        lastStep = step;
        shownAt = at;
      }
    }
  };
}

export interface WorkerDeps {
  api: CreativeApi;
  runnerApi: RunnerApi;
  creative: Omit<CreativeDeps, "runBlocks">;
  env: BundleEnv;
  host: string;
  log: (line: string) => void;
  // The app's client list (main.ts keeps it fresh; fresh: true fetches it
  // now). The job's client is looked up here by id.
  tenants: (fresh?: boolean) => Promise<ClaimTenant[]>;
}

/** Thrown out of a step once the VPS has cancelled the job: nothing more is uploaded or carded. */
class Cancelled extends Error {}

/** The transcripts a prepare wrote this job, for the agent on the VPS to read. */
function newTranscripts(workDir: string, since: number): { rel: string; content: string }[] {
  const dir = join(workDir, "tx");
  if (!existsSync(dir)) return [];
  const out: { rel: string; content: string }[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).mtimeMs < since) continue;
    const content = readSmall(file);
    if (content !== null && TO_VPS.test(`tx/${name}`)) out.push({ rel: `tx/${name}`, content });
  }
  return out;
}

/** The PC's side: claim one job, do it, report back. false when none was queued. */
export async function workOnePcJob(d: WorkerDeps): Promise<boolean> {
  const job = await d.api.pcJob({ action: "claim", host: d.host });
  if (!job) return false;
  d.log(`video job ${job.id} for message ${job.messageId}`);
  const finish = (body: { result?: Record<string, unknown>; error?: string }) =>
    d.api.pcJob({ action: "finish", id: job.id, host: d.host, ...body }).catch((e) => d.log(`video job finish failed: ${(e as Error).message}`));
  try {
    const p = job.payload;
    // A client added since the last refresh is not in the cached list yet.
    const tenant = (await d.tenants()).find((x) => x.id === job.tenantId) ?? (await d.tenants(true)).find((x) => x.id === job.tenantId);
    if (!tenant) throw new Error("the job's client is not in the app's client list");
    const workDir = workDirFor(d.env, "ads", tenant);
    const stateDir = stateDirFor(d.env, "ads", tenant);
    const driveDir = findDriveFolder(d.env.driveRoot, tenant);
    const fromRef = (s: string) => fromDriveRef(d.env.driveRoot, s);
    mkdirSync(workDir, { recursive: true });
    const files = Array.isArray(p.files) ? (p.files as { rel: string; content: string }[]) : [];
    writeFiles(
      workDir,
      files.map((f) => {
        if (typeof f?.content !== "string" || !String(f.rel).endsWith(".json")) return f;
        try {
          return { ...f, content: JSON.stringify(mapPaths(JSON.parse(f.content), fromRef), null, 2) };
        } catch {
          return f;
        }
      }),
      TO_PC,
    );
    writeStateFile(stateDir, p.state);
    const blocks = mapPaths(p.blocks, fromRef) as VideoBlock[];
    const retried = new Set(Array.isArray(p.retried) ? (p.retried as string[]) : []);
    const since = Date.now() - 1000;
    let stopped = false;
    const t: CreativeTurn = {
      deps: d.creative,
      runnerApi: d.runnerApi,
      messageId: job.messageId,
      chatId: typeof p.chatId === "string" ? p.chatId : "",
      tenant,
      workDir,
      stateDir,
      driveDir,
      vaultFolder: join(d.env.vaultDir, "Clients", vaultFolder(tenant)),
      // Each step is reported, and a refused one means the VPS gave up (the
      // job was cancelled): the next step throws, so no upload or card follows.
      say: (step) => {
        if (stopped) throw new Cancelled("the job was cancelled");
        d.api.pcJob({ action: "step", id: job.id, host: d.host, step }).catch((e) => {
          if (/\b409\b/.test((e as Error).message)) stopped = true;
        });
      },
      log: d.log,
      check: async () => {
        const now = await d.api.pcJob({ action: "get", id: job.id });
        if (now?.status !== "running" || now.host !== d.host) {
          stopped = true;
          throw new Cancelled("the job was cancelled");
        }
      },
    };
    const r = await runVideoBlocks(Array.isArray(blocks) ? blocks : [], t, retried);
    await finish({ result: { notes: r.notes, again: r.again, files: newTranscripts(workDir, since), state: readState(stateDir), retried: [...retried] } });
  } catch (e) {
    d.log(`video job ${job.id} failed: ${(e as Error).message}`);
    await finish({ error: (e as Error).message });
  }
  return true;
}
