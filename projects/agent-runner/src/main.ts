// The agent runner: the PC half of the Agents section.
//
// Jake sends a message in the app; it is stored as queued. Nothing in the
// cloud can start anything on this PC, so this process polls for it every 3
// seconds, claims it, runs the agent with `claude -p`, and posts the answer
// back. The same shape as the lead scraper's watcher, and installed the same
// way (install-watcher.ps1: a logon task that restarts on exit).
//
//   npx tsx src/main.ts                    watch (what the scheduled task runs)
//   npx tsx src/main.ts --once             heartbeat, answer one message, exit
//   --monitor      run startup monitoring even with --once (still 6h-gated)
//   --no-monitor   skip startup monitoring in watch mode
//
// On start: mirror every brain to the app (so Obsidian edits show up in the
// Brain tab; `--sync-lessons` in the plan's commands is this, and is always
// on), heartbeat (applying any queued Brain-tab edits), then startup
// monitoring if the last run was 6 hours ago or more. Watch mode re-mirrors
// every 10 minutes with the client list.
//
// The off switch is the lead scraper's: a file at data/.stop and the runner
// idles, sending no heartbeat, so the app shows it offline and messages wait.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { createApi } from "./api.ts";
import { defaultBundleEnv, workDirFor } from "./bundle.ts";
import { runClaude, type RunOptions } from "./claude.ts";
import { AGENT_IDS } from "./agents.ts";
import { hermesRunner } from "./hermes.ts";
import { appTools } from "./appOps.ts";
import { startBridge, type Bridge } from "./mcpBridge.ts";
import { API_BASE, CLAIM_AGENTS, DATA_DIR, DRIVE_MODE, DRIVE_REMOTE, DRIVE_ROOT, ENGINE, GIT_PUSH, HERMES_API, HEARTBEAT_MS, HIGGSFIELD_LOGIN, PAGES_CWD, PC_JOBS, POLL_MS, REPO_DIR, RUNNER_DIR, SITES_DIR, SNAPSHOTS_FILE } from "./config.ts";
import { createCreativeApi } from "./creativeApi.ts";
import { commitBrains, pullRepo } from "./git.ts";
import { defaultExec, driveAgent, pullDrive, pushChanged, type DriveSync } from "./drive.ts";
import { findDriveFolder } from "./clients.ts";
import { deployDraft, promote } from "./pages.ts";
import { runMonitorIfDue } from "./monitor.ts";
import { fileBriefNotes } from "./notes.ts";
import { applyQueuedEdits, handleClaim, syncAllBrains, type RunnerDeps } from "./runner.ts";
import { fileStore, higgsfieldClient } from "./higgsfield.ts";
import { remoteVideoBlocks, workOnePcJob } from "./pcJobs.ts";
import { balanceReader, parseBalance, spendLimit } from "./spend.ts";
import { exec } from "./video.ts";
import type { AgentId, ClaimResponse, ClaimTenant } from "./wire.ts";

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const STOP_FILE = join(DATA_DIR, ".stop");
const TENANTS_EVERY_MS = 10 * 60_000;

function log(line: string): void {
  console.log(`${new Date().toISOString()} ${line}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Doppler is the source of truth for every secret, read-only from here. An env
// var wins so a test shell can point at a fake API without touching Doppler.
function readSecret(): string {
  if (process.env.AGENT_RUNNER_SECRET) return process.env.AGENT_RUNNER_SECRET;
  try {
    return execFileSync(
      "doppler",
      ["secrets", "get", "AGENT_RUNNER_SECRET", "--plain", "-p", "hauck-command-center", "-c", "prd"],
      { encoding: "utf8", windowsHide: true },
    ).trim();
  } catch (e) {
    throw new Error(`could not read AGENT_RUNNER_SECRET from Doppler: ${(e as Error).message}`);
  }
}

// Each Hermes profile's API key, from HERMES_KEY_<AGENT> (the VPS container's
// env, filled from Doppler). An agent with no key fails its turn with that
// reason rather than calling Hermes unauthenticated.
function hermesRun(): (o: RunOptions) => Promise<{ text: string; tools: string[] }> {
  const keys = Object.fromEntries(AGENT_IDS.map((a) => [a, process.env[`HERMES_KEY_${a.toUpperCase()}`] ?? ""]).filter(([, k]) => k));
  const run = hermesRunner({ base: HERMES_API, keys });
  return (o) => {
    if (!o.agent) throw new Error("a Hermes turn needs its agent");
    return run({ ...o, agent: o.agent });
  };
}

async function main(): Promise<void> {
  const secret = readSecret();
  if (secret.length < 32) throw new Error("AGENT_RUNNER_SECRET looks too short; check Doppler");
  const host = hostname();
  const api = createApi({ base: API_BASE, secret });
  const creativeApi = createCreativeApi({ base: API_BASE, secret });
  // On Hermes the runner holds its own Higgsfield login and serves the Ads
  // Agent's Higgsfield tools itself (mcpBridge.ts); claude used Jake's.
  const hf = ENGINE === "hermes" ? higgsfieldClient({ store: fileStore(HIGGSFIELD_LOGIN) }) : null;
  const balance = hf
    ? async () => {
        try {
          return parseBalance((await hf.call("balance", {})).text);
        } catch {
          return null;
        }
      }
    : balanceReader(runClaude, join(DATA_DIR, "work", "balance"));
  let tenants: ClaimTenant[] = [];
  const deps: RunnerDeps = {
    api,
    env: defaultBundleEnv(),
    today: () => new Date().toLocaleDateString("en-CA"),
    run: ENGINE === "hermes" ? hermesRun() : runClaude,
    commit: (paths, summary) => commitBrains(paths, summary, { cwd: REPO_DIR, push: GIT_PUSH }),
    // The secret stays out of claude's environment (see RunnerDeps).
    childEnv: (tenant, messageId) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        AGENT_RUNNER_API: API_BASE,
        AGENT_TENANT_ID: tenant?.id ?? "",
        AGENT_MESSAGE_ID: messageId,
      };
      delete env.AGENT_RUNNER_SECRET;
      return env;
    },
    log,
    landing: {
      sitesRoot: SITES_DIR,
      deployDraft: (slug, itemId, dir) => deployDraft(slug, itemId, dir, { cwd: PAGES_CWD }),
      promote: (slug, dir) => promote(slug, dir, { cwd: PAGES_CWD }),
    },
    // The Ads Agent's video pipeline, uploads and Higgsfield balance. On the
    // VPS the clip work goes to the PC (pcJobs.ts).
    creative: {
      api: creativeApi,
      exec,
      balance,
      ...(ENGINE === "hermes" ? { runBlocks: remoteVideoBlocks({ api: creativeApi, driveRoot: DRIVE_ROOT }) } : {}),
    },
    briefNotes: fileBriefNotes(join(DATA_DIR, "brief-notes")),
    clients: () => tenants,
  };

  // The Hermes agents' way to the app (mcpBridge.ts). Each profile's MCP
  // entry carries its HERMES_MCP_TOKEN_<AGENT>; the port is the one
  // deploy/vps/profiles.sh points them at.
  let bridge: Bridge | null = null;
  if (ENGINE === "hermes") {
    const tokens = Object.fromEntries(
      AGENT_IDS.map((a) => [a, process.env[`HERMES_MCP_TOKEN_${a.toUpperCase()}`] ?? ""]).filter(([, t]) => t),
    );
    bridge = await startBridge({ port: Number(process.env.HERMES_MCP_PORT ?? 8700), tokens, tools: appTools({ base: API_BASE, secret, higgsfield: hf ?? undefined }) });
    log(`app tools for Hermes on port ${bridge.port} (${Object.keys(tokens).join(", ") || "no tokens set"}); Higgsfield ${hf?.ready() ? "signed in" : "not signed in"}`);
  }

  // The VPS's Drive mirror (drive.ts). The pull runs beside the claim loop, not
  // in it: the first one copies gigabytes, and Jake's message should not wait.
  const drive: DriveSync | null = DRIVE_MODE === "rclone" ? { remote: DRIVE_REMOTE, localRoot: DRIVE_ROOT, exec: defaultExec } : null;
  let pulling = false;
  function refreshDrive(): void {
    if (!drive || pulling) return;
    pulling = true;
    pullDrive(drive)
      .then(() => log("drive mirror refreshed"))
      .catch((e) => log(`drive pull failed: ${(e as Error).message}`))
      .finally(() => (pulling = false));
  }

  let tenantsAt = 0;
  async function refreshTenants(force = false): Promise<void> {
    if (!force && Date.now() - tenantsAt < TENANTS_EVERY_MS) return;
    try {
      // The VPS clone picks up Jake's vault edits before they are mirrored.
      if (GIT_PUSH) await pullRepo({ cwd: REPO_DIR }).catch((e) => log(`git pull failed: ${(e as Error).message}`));
      refreshDrive();
      tenants = await api.tenants();
      tenantsAt = Date.now();
      const n = await syncAllBrains(tenants, deps);
      log(`brains mirrored: ${n} lessons across ${tenants.length} clients`);
    } catch (e) {
      log(`tenant refresh failed: ${(e as Error).message}`);
    }
  }

  let beating = false;
  async function beat(): Promise<string | null> {
    if (beating) return null;
    beating = true;
    try {
      const hb = await api.heartbeat({ host });
      if (hb.queuedEdits.length) {
        const ids = await applyQueuedEdits(hb.queuedEdits, tenants, deps);
        log(`applied ${ids.length} Brain tab edits`);
      }
      return hb.lastMonitorAt;
    } catch (e) {
      log(`heartbeat failed: ${(e as Error).message}`);
      return null;
    } finally {
      beating = false;
    }
  }

  async function monitor(lastMonitorAt: string | null): Promise<void> {
    try {
      await runMonitorIfDue({ api, host, snapshotsFile: SNAPSHOTS_FILE, now: new Date(), lastMonitorAt, log });
    } catch (e) {
      log(`monitor failed: ${(e as Error).message}`);
    }
  }

  // On the VPS each agent runs its own turn beside the others, one at a time
  // per agent (the bridge keeps one turn per agent), so an Ads turn waiting
  // on a PC render never holds up the Manager. The PC stays one turn at a time.
  const PARALLEL = ENGINE === "hermes";
  const busy = new Set<AgentId>();
  const turns = new Set<Promise<void>>();

  async function claimOne(): Promise<boolean> {
    const free = PARALLEL ? (CLAIM_AGENTS ?? AGENT_IDS).filter((a) => !busy.has(a)) : CLAIM_AGENTS;
    if (free && free.length === 0 && CLAIM_AGENTS?.length !== 0) return false;
    const claim = await api.claim(host, free);
    if (!claim) return false;
    if (!PARALLEL) {
      await runClaim(claim);
      return true;
    }
    const agent = claim.chat.agent;
    busy.add(agent);
    const turn = runClaim(claim)
      .catch((e) => log(`turn ${claim.message.id} failed: ${(e as Error).message}`))
      .finally(() => {
        busy.delete(agent);
        turns.delete(turn);
      });
    turns.add(turn);
    return true;
  }

  async function runClaim(claim: ClaimResponse): Promise<void> {
    log(`claimed ${claim.message.id} (${claim.chat.agent}, ${claim.tenant?.name ?? "agency"})`);
    // The bridge answers this agent's tool calls for this turn only, in this
    // turn's folders: its work folder, and its client's Drive folder (not for
    // the GHL Agent, which never had one). Only the CSM and Research write to
    // Drive; the Ads Agent writes its configs and pages in its work folder.
    // Higgsfield's paid tools answer only under this turn's spend grant.
    const agent = claim.chat.agent;
    const writes = driveAgent(agent);
    const folder = claim.tenant && agent !== "ghl" ? findDriveFolder(DRIVE_ROOT, claim.tenant) : null;
    const roots = agent === "ghl" ? [] : [{ dir: workDirFor(deps.env, agent, claim.tenant), write: writes || agent === "ads" }];
    if (folder) roots.push({ dir: folder, write: writes });
    const spend = agent === "ads" ? spendLimit(claim.message.grant) : null;
    bridge?.setTurn(agent, { tenantId: claim.tenant?.id ?? null, messageId: claim.message.id, roots, spend });
    let written: string[] = [];
    try {
      await handleClaim(claim, deps);
    } finally {
      written = bridge?.written(agent) ?? [];
      bridge?.setTurn(agent, null);
    }
    // On the VPS, what the agent wrote into the client's Drive folder goes up
    // after the turn, and only that (drive.ts).
    const toDrive = folder ? written.filter((p) => p.startsWith(folder + "/")).map((p) => p.slice(folder.length + 1)) : [];
    if (drive && folder && toDrive.length) {
      await pushChanged(drive, folder, toDrive)
        .then((sent) => log(`drive: uploaded ${sent.join(", ")}`))
        .catch((e) => log(`drive push failed: ${(e as Error).message}`));
    }
    log(`finished ${claim.message.id}`);
  }

  // The client a video job is for, from the app's own list; fresh when the
  // job's client is not in it (one added since the last 10 minute refresh).
  async function jobTenants(fresh = false): Promise<ClaimTenant[]> {
    return tenants.length && !fresh ? tenants : (tenants = await api.tenants());
  }

  if (existsSync(STOP_FILE)) log("data/.stop is present: idling until it is deleted");
  while (existsSync(STOP_FILE)) await sleep(10_000);

  // Tenants before the heartbeat: a queued edit to a client brain needs to
  // know which tenant that folder belongs to before it is mirrored back.
  await refreshTenants(true);
  const lastMonitorAt = await beat();

  if (ONCE) {
    if (args.has("--monitor")) await monitor(lastMonitorAt);
    const did = await claimOne();
    await Promise.all(turns);
    log(did ? "done" : "nothing queued");
    return;
  }

  if (!args.has("--no-monitor")) await monitor(lastMonitorAt);

  // The heartbeat runs on its own clock, so a ten minute agent turn does not
  // read as the PC going offline.
  setInterval(() => {
    if (!existsSync(STOP_FILE)) void beat();
  }, HEARTBEAT_MS);

  const watching = CLAIM_AGENTS === undefined ? "all" : CLAIM_AGENTS.join(", ") || "no";
  log(`watching for ${watching} agent messages${PC_JOBS ? " and video jobs" : ""} on ${API_BASE} as ${host} (${ENGINE})`);
  let failures = 0;
  for (;;) {
    if (existsSync(STOP_FILE)) {
      await sleep(10_000);
      continue;
    }
    try {
      await refreshTenants();
      // The PC also takes the VPS's clip video work (pcJobs.ts).
      const did =
        (await claimOne()) ||
        (PC_JOBS && (await workOnePcJob({ api: creativeApi, runnerApi: api, creative: deps.creative!, env: deps.env, host, log, tenants: jobTenants })));
      failures = 0;
      if (!did) await sleep(POLL_MS);
    } catch (e) {
      // The app unreachable is the common case (Wi-Fi, a deploy). Back off to
      // 30s rather than logging a failure every 3 seconds all afternoon.
      failures++;
      if (failures === 1 || failures % 20 === 0) log(`poll failed (${failures}x): ${(e as Error).message}`);
      await sleep(failures > 3 ? 30_000 : POLL_MS);
    }
  }
}

main().catch((e) => {
  log(`fatal: ${(e as Error).message}`);
  process.exit(1);
});
