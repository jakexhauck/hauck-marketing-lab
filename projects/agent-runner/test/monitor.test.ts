import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runMonitorIfDue } from "../src/monitor.ts";
import type { Snapshot } from "../src/wire.ts";
import { fakeApi } from "./fakeApi.ts";

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  cpl: 40,
  frequency: 1.5,
  leads7d: 10,
  stuckNewOver48h: 0,
  checklistDone: 5,
  checklistTotal: 30,
  accountsRed: 0,
  ...over,
});
const tenants = [
  { id: "t1", name: "Willis Windows", slug: "willis-windows", metaAdAccountId: "act_1" },
  { id: "t2", name: "Made Better", slug: "made-better-landscaping-co", metaAdAccountId: null },
];
const now = new Date("2026-10-17T12:00:00Z");

describe("runMonitorIfDue", () => {
  it("queues Auto chats only where a trigger fired, saves snapshots, and marks the run", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mon-")), "snapshots.json");
    writeFileSync(file, JSON.stringify({ t1: snap(), t2: snap() }));
    const api = fakeApi({ tenantList: tenants, snapshots: { t1: snap({ cpl: 60 }), t2: snap() } });
    const n = await runMonitorIfDue({ api, host: "PC", snapshotsFile: file, now, lastMonitorAt: null });
    expect(n).toBe(1);
    expect(api.autoChats).toEqual([
      { tenantId: "t1", agent: "ads", title: "Startup check", prompt: "Startup check: CPL up 50% ($40.00 to $60.00)" },
    ]);
    expect(JSON.parse(readFileSync(file, "utf8")).t1.cpl).toBe(60);
    expect(api.heartbeats).toEqual([{ host: "PC", monitored: true }]);
  });

  it("does nothing inside 6 hours", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mon-")), "snapshots.json");
    const api = fakeApi({ tenantList: tenants });
    const n = await runMonitorIfDue({
      api,
      host: "PC",
      snapshotsFile: file,
      now,
      lastMonitorAt: "2026-10-17T08:00:00Z",
    });
    expect(n).toBeNull();
    expect(api.autoChats).toEqual([]);
    expect(api.heartbeats).toEqual([]);
  });

  it("keeps the old snapshot for a tenant whose snapshot failed", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "mon-")), "snapshots.json");
    writeFileSync(file, JSON.stringify({ t1: snap(), t2: snap({ cpl: 99 }) }));
    const api = fakeApi({ tenantList: tenants, snapshots: { t1: snap() } });
    expect(await runMonitorIfDue({ api, host: "PC", snapshotsFile: file, now, lastMonitorAt: null })).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).t2.cpl).toBe(99);
  });
});
