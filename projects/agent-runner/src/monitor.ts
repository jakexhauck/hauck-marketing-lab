// Startup monitoring: once per logon, at most once every 6 hours.
//
// The watcher is a logon task, so "when the PC starts" is "when the watcher
// starts". The app remembers when the last run happened (heartbeat returns
// last_monitor_at), not this PC, so a reinstall or a second machine does not
// reset the clock.
//
// The last snapshot per client lives in data/snapshots.json. It is the "before"
// for the CPL and checklist comparisons. A client whose snapshot fails this
// time keeps its old one, so one bad call does not turn the next run's
// comparison into "changed from nothing".
//
// Each finding becomes an Auto chat for that agent with a queued "Startup
// check: <reason>" message, which the ordinary claim loop then answers. The
// monitor itself never runs Claude.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RunnerApi } from "./api.ts";
import { planMonitor, shouldRunMonitor } from "./monitorRules.ts";
import type { Snapshot } from "./wire.ts";

export interface MonitorDeps {
  api: RunnerApi;
  host: string;
  snapshotsFile: string;
  now: Date;
  lastMonitorAt: string | null;
  log?: (line: string) => void;
}

function loadSnapshots(file: string): Record<string, Snapshot> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, Snapshot>;
  } catch {
    return {};
  }
}

// Returns how many Auto chats were queued, or null when it was not due.
export async function runMonitorIfDue(d: MonitorDeps): Promise<number | null> {
  const log = d.log ?? (() => {});
  if (!shouldRunMonitor(d.lastMonitorAt, d.now)) {
    log(`monitor: last run ${d.lastMonitorAt}, under 6h ago; skipping`);
    return null;
  }
  const tenants = await d.api.tenants();
  const prev = loadSnapshots(d.snapshotsFile);
  const next: Record<string, Snapshot> = {};
  for (const t of tenants) {
    try {
      next[t.id] = await d.api.snapshot(t.id);
    } catch (e) {
      log(`monitor: snapshot failed for ${t.name}: ${(e as Error).message}`);
    }
  }

  const rows = planMonitor(tenants, prev, next);
  for (const row of rows) {
    await d.api.autoChat({
      tenantId: row.tenantId,
      agent: row.agent,
      title: "Startup check",
      prompt: `Startup check: ${row.reason}`,
    });
    log(`monitor: ${row.agent} at ${tenants.find((t) => t.id === row.tenantId)?.name}: ${row.reason}`);
  }

  mkdirSync(dirname(d.snapshotsFile), { recursive: true });
  writeFileSync(d.snapshotsFile, JSON.stringify({ ...prev, ...next }, null, 2));
  await d.api.heartbeat({ host: d.host, monitored: true });
  log(`monitor: ${tenants.length} clients checked, ${rows.length} Auto chats`);
  return rows.length;
}
