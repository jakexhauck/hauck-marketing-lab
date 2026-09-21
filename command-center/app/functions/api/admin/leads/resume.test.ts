import { describe, it, expect, vi } from "vitest";
import { nextHoldAt, resumeRun } from "./resume";

// Continue puts a held run back on the queue and moves the next hold point up
// by the cap, counted from where the run actually stopped (it overshoots by up
// to a keyword's worth of leads, so 200 + 200 would hold almost at once).

describe("the next hold point", () => {
  it("is where the run stopped plus the cap", () => {
    expect(nextHoldAt(212, 200)).toBe(412);
  });
  it("is nothing when the run has no cap", () => {
    expect(nextHoldAt(212, null)).toBeNull();
  });
});

function client(read: { data: unknown; error?: { message: string } }, write: { data: unknown; error?: { message: string } }) {
  const calls: { update?: unknown; eqs: [string, unknown][] } = { eqs: [] };
  let n = 0;
  const q = {
    select: vi.fn(() => q),
    update: vi.fn((patch: unknown) => { calls.update = patch; return q; }),
    eq: vi.fn((col: string, v: unknown) => { calls.eqs.push([col, v]); return q; }),
    maybeSingle: vi.fn(() => {
      const r = n++ === 0 ? read : write;
      return Promise.resolve({ data: r.data, error: r.error ?? null });
    }),
  };
  return { calls, client: { from: vi.fn(() => q) } as never };
}

const HELD = { id: "r1", status: "held", new_count: 212, lead_cap: 200 };
const ROW = {
  id: "r1", niche_id: "windows", niche_label: "Windows", states: [], cities: [],
  size: "standard", status: "queued", host: "jake-pc", error: null, total_queries: 400,
  done_queries: 40, raw_found: 900, kept_count: 300, passed_count: 0, sendable_count: 0,
  new_count: 212, in_crm_count: 0, excluded_count: 0, sent_count: 0, pass_rate: null,
  failure_rate: null, blocked: false, crm_snapshot_count: 0, crm_snapshot_partial: false,
  lead_cap: 200, hold_at: 412, created_at: "2026-09-21T10:00:00Z",
  started_at: "2026-09-21T10:01:00Z", finished_at: null,
};

describe("continuing a held run", () => {
  it("queues it again with the next hold point", async () => {
    const { client: c, calls } = client({ data: HELD }, { data: ROW });
    const out = await resumeRun(c, "r1");
    expect(out.ok && out.run.status).toBe("queued");
    expect(calls.update).toEqual({ status: "queued", hold_at: 412 });
  });

  // The status filter travels with the write, so a Stop pressed between the
  // read and the write is never turned back into a queued run.
  it("only writes while the row still reads held", async () => {
    const { client: c, calls } = client({ data: HELD }, { data: ROW });
    await resumeRun(c, "r1");
    expect(calls.eqs).toContainEqual(["status", "held"]);
  });

  it("refuses a run that is not held", async () => {
    const { client: c, calls } = client({ data: { ...HELD, status: "running" } }, { data: ROW });
    expect(await resumeRun(c, "r1")).toEqual({ ok: false, reason: "not_held" });
    expect(calls.update).toBeUndefined();
  });

  it("reports a run that moved on mid-way as not held", async () => {
    const { client: c } = client({ data: HELD }, { data: null });
    expect(await resumeRun(c, "r1")).toEqual({ ok: false, reason: "not_held" });
  });

  it("does not read a failed read or write as not held", async () => {
    expect(await resumeRun(client({ data: null, error: { message: "x" } }, { data: ROW }).client, "r1"))
      .toEqual({ ok: false, reason: "failed" });
    expect(await resumeRun(client({ data: HELD }, { data: null, error: { message: "x" } }).client, "r1"))
      .toEqual({ ok: false, reason: "failed" });
  });
});
