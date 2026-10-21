import { describe, expect, it } from "vitest";
import { planMonitor, shouldRunMonitor } from "../src/monitorRules.ts";
import type { Snapshot } from "../src/wire.ts";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const H = 3600_000;

describe("shouldRunMonitor", () => {
  it("waits 6 hours between runs", () => {
    expect(shouldRunMonitor(ago(6 * H - 60_000), now)).toBe(false);
    expect(shouldRunMonitor(ago(6 * H), now)).toBe(true);
    expect(shouldRunMonitor(null, now)).toBe(true);
  });
});

const base: Snapshot = {
  cpl: 40,
  frequency: 1.8,
  leads7d: 12,
  stuckNewOver48h: 0,
  checklistDone: 10,
  checklistTotal: 30,
  accountsRed: 1,
};
const tenants = [{ id: "t1", name: "Willis Windows", slug: "willis-windows", metaAdAccountId: "act_1" }];
const plan = (next: Partial<Snapshot>, prev: Snapshot | null = base) =>
  planMonitor(tenants, prev ? { t1: prev } : {}, { t1: { ...base, ...next } });

describe("planMonitor", () => {
  it("returns nothing when nothing moved", () => {
    expect(plan({})).toEqual([]);
    expect(plan({ cpl: 47 })).toEqual([]);
  });

  it("fires ads on a 20% CPL move either way", () => {
    expect(plan({ cpl: 48 })).toEqual([{ tenantId: "t1", agent: "ads", reason: "CPL up 20% ($40.00 to $48.00)" }]);
    expect(plan({ cpl: 32 })[0]).toMatchObject({ agent: "ads", reason: "CPL down 20% ($40.00 to $32.00)" });
  });

  it("fires ads at frequency 3.0", () => {
    expect(plan({ frequency: 3 })).toEqual([{ tenantId: "t1", agent: "ads", reason: "Frequency at 3.0" }]);
    expect(plan({ frequency: 2.99 })).toEqual([]);
  });

  it("fires ghl on a lead stuck in New over 48h", () => {
    expect(plan({ stuckNewOver48h: 2 })).toEqual([
      { tenantId: "t1", agent: "ghl", reason: "2 leads in New over 48h" },
    ]);
  });

  it("fires manager on a checklist or accounts change", () => {
    expect(plan({ checklistDone: 11 })).toEqual([
      { tenantId: "t1", agent: "csm", reason: "Setup tasks 10/30 to 11/30" },
    ]);
    expect(plan({ accountsRed: 0 })).toEqual([
      { tenantId: "t1", agent: "csm", reason: "Account checks red 1 to 0" },
    ]);
  });

  it("joins two ads reasons into one row", () => {
    expect(plan({ cpl: 60, frequency: 3.4 })).toEqual([
      { tenantId: "t1", agent: "ads", reason: "CPL up 50% ($40.00 to $60.00); Frequency at 3.4" },
    ]);
  });

  it("with no earlier snapshot, fires only the absolute lines", () => {
    expect(plan({ cpl: 400 }, null)).toEqual([]);
    expect(plan({ frequency: 3.1 }, null)).toHaveLength(1);
  });

  it("skips a tenant whose snapshot failed", () => {
    expect(planMonitor(tenants, { t1: base }, {})).toEqual([]);
  });
});
