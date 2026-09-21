import { describe, it, expect, vi } from "vitest";
import { holdRun } from "./hold";

// Hold is one filtered write, same shape as Stop. The runner re-reads the row
// between keywords and parks when it reads 'held'. Only a run that is queued or
// running can be held: a finished run has nothing to park, and a preparing run
// is flipped to 'queued' by the CRM sweep, which would silently undo the hold.

function client(data: unknown, error?: { message: string }) {
  const calls: Record<string, unknown> = {};
  const q = {
    update: vi.fn((patch: unknown) => { calls.update = patch; return q; }),
    eq: vi.fn((col: string, v: string) => { calls.eq = [col, v]; return q; }),
    in: vi.fn((col: string, v: string[]) => { calls.in = [col, v]; return q; }),
    select: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error: error ?? null })),
  };
  return { calls, client: { from: vi.fn(() => q) } as never };
}

const ROW = {
  id: "r1", niche_id: "windows", niche_label: "Windows", states: [], cities: [],
  size: "standard", status: "held", host: "jake-pc", error: null, total_queries: 400,
  done_queries: 40, raw_found: 900, kept_count: 300, passed_count: 0, sendable_count: 0,
  new_count: 212, in_crm_count: 0, excluded_count: 0, sent_count: 0, pass_rate: null,
  failure_rate: null, blocked: false, crm_snapshot_count: 0, crm_snapshot_partial: false,
  lead_cap: 200, hold_at: 200, created_at: "2026-09-21T10:00:00Z",
  started_at: "2026-09-21T10:01:00Z", finished_at: null,
};

describe("holding a run", () => {
  it("parks it as held and hands back the shaped run", async () => {
    const { client: c, calls } = client(ROW);
    const out = await holdRun(c, "r1");
    expect(out.ok && out.run.status).toBe("held");
    expect(calls.update).toEqual({ status: "held" });
    expect(calls.eq).toEqual(["id", "r1"]);
  });

  it("only matches a run that is queued or running", async () => {
    const { client: c, calls } = client(ROW);
    await holdRun(c, "r1");
    expect(calls.in).toEqual(["status", ["queued", "running"]]);
  });

  it("never writes an ending, because a held run has not ended", async () => {
    const { client: c, calls } = client(ROW);
    await holdRun(c, "r1");
    expect(calls.update).not.toHaveProperty("finished_at");
  });

  it("reports nothing to hold apart from a failure", async () => {
    expect(await holdRun(client(null).client, "r1")).toEqual({ ok: false, reason: "not_active" });
    expect(await holdRun(client(null, { message: "boom" }).client, "r1")).toEqual({ ok: false, reason: "failed" });
  });
});
