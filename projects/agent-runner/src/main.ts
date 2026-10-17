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
import { defaultBundleEnv } from "./bundle.ts";
import { runClaude } from "./claude.ts";
import { API_BASE, DATA_DIR, HEARTBEAT_MS, POLL_MS, REPO_DIR, RUNNER_DIR, SNAPSHOTS_FILE } from "./config.ts";
import { commitBrains } from "./git.ts";
import { runMonitorIfDue } from "./monitor.ts";
import { applyQueuedEdits, handleClaim, syncAllBrains, type RunnerDeps } from "./runner.ts";
import type { ClaimTenant } from "./wire.ts";

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

async function main(): Promise<void> {
  const secret = readSecret();
  if (secret.length < 32) throw new Error("AGENT_RUNNER_SECRET looks too short; check Doppler");
  const host = hostname();
  const api = createApi({ base: API_BASE, secret });
  const deps: RunnerDeps = {
    api,
    env: defaultBundleEnv(),
    today: () => new Date().toLocaleDateString("en-CA"),
    run: runClaude,
    commit: (paths, summary) => commitBrains(paths, summary, { cwd: REPO_DIR }),
    // Claude runs in the runner folder so `node bin/meta.mjs` resolves, and
    // the Meta script finds its way to the app through these three.
    cwd: RUNNER_DIR,
    childEnv: (tenant) => ({
      ...process.env,
      AGENT_RUNNER_API: API_BASE,
      AGENT_RUNNER_SECRET: secret,
      AGENT_TENANT_ID: tenant?.id ?? "",
    }),
    log,
  };

  let tenants: ClaimTenant[] = [];
  let tenantsAt = 0;
  async function refreshTenants(force = false): Promise<void> {
    if (!force && Date.now() - tenantsAt < TENANTS_EVERY_MS) return;
    try {
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

  async function claimOne(): Promise<boolean> {
    const claim = await api.claim(host);
    if (!claim) return false;
    log(`claimed ${claim.message.id} (${claim.chat.agent}, ${claim.tenant?.name ?? "agency"})`);
    await handleClaim(claim, deps);
    log(`finished ${claim.message.id}`);
    return true;
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
    log(did ? "done" : "nothing queued");
    return;
  }

  if (!args.has("--no-monitor")) await monitor(lastMonitorAt);

  // The heartbeat runs on its own clock, so a ten minute agent turn does not
  // read as the PC going offline.
  setInterval(() => {
    if (!existsSync(STOP_FILE)) void beat();
  }, HEARTBEAT_MS);

  log(`watching for agent messages on ${API_BASE} as ${host}`);
  let failures = 0;
  for (;;) {
    if (existsSync(STOP_FILE)) {
      await sleep(10_000);
      continue;
    }
    try {
      await refreshTenants();
      const did = await claimOne();
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
