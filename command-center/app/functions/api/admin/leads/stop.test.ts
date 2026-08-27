import { describe, it, expect, vi } from "vitest";
import { stopRun } from "./stop";

// Stopping a run is one filtered write, and the filter is the whole safety. It
// has to end a run that is genuinely mid-scrape AND one stranded at 'running' by
// a killed runner (nothing reaps those; one sat there overnight on 27 August),
// while refusing to touch a run that already has an ending.

function client(data: unknown, error?: { message: string }) {
  const calls: Record<string, unknown> = {};
  const q = {
    update: vi.fn((patch: unknown) => { calls.update = patch; return q; }),
    eq: vi.fn((col: string, v: string) => { calls.eq = [col, v]; return q; }),
    in: vi.fn((col: string, v: string[]) => { calls.in = [col, v]; return q; }),
    select: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error: error ?? null })),
  };
  return {
    calls,
    client: { from: vi.fn((t: string) => { calls.from = t; return q; }) } as never,
  };
}

const ROW = {
  id: "r1", niche_id: "windows", niche_label: "Windows and doors installation",
  states: ["CO"], cities: [], size: "standard", status: "cancelled", host: "jake-pc",
  error: "stopped from the app", total_queries: 400, done_queries: 295, raw_found: 22826,
  kept_count: 2021, passed_count: 0, sendable_count: 0, new_count: 0, in_crm_count: 0,
  excluded_count: 0, sent_count: 0, pass_rate: null, failure_rate: null, blocked: false,
  crm_snapshot_count: 0, crm_snapshot_partial: false, created_at: "2026-08-26T21:16:50Z",
  started_at: "2026-08-26T21:17:04Z", finished_at: "2026-08-27T13:59:04Z",
};

describe("stopping a run", () => {
  it("cancels it and hands back the shaped run", async () => {
    const { client: c, calls } = client(ROW);
    const out = await stopRun(c, "r1");
    expect(out.ok).toBe(true);
    expect(out.ok && out.run.status).toBe("cancelled");
    expect(out.ok && out.run.doneQueries).toBe(295);
    expect(calls.from).toBe("scrape_runs");
    expect(calls.eq).toEqual(["id", "r1"]);
  });

  // The status filter travels WITH the write. A read-then-write would race a
  // runner finishing a second later and would stamp 'cancelled' over a genuine
  // completion, throwing away the finish.
  it("only ever matches a run that has not finished", async () => {
    const { client: c, calls } = client(ROW);
    await stopRun(c, "r1");
    expect(calls.in).toEqual(["status", ["preparing", "queued", "running"]]);
  });

  it("writes an ending, not just a status", async () => {
    const { client: c, calls } = client(ROW);
    await stopRun(c, "r1");
    const patch = calls.update as Record<string, string>;
    expect(patch.status).toBe("cancelled");
    expect(patch.error).toBe("stopped from the app");
    expect(Date.parse(patch.finished_at)).not.toBeNaN();
  });

  // Nothing matched: the run had already ended. That is a state to explain, not
  // a failure, and it must not read as one.
  it("reports a run that was already finished apart from a failure", async () => {
    const { client: c } = client(null);
    expect(await stopRun(c, "r1")).toEqual({ ok: false, reason: "not_active" });
  });

  // supabase-js RESOLVES a failed write with { data: null, error }, so the two
  // look identical if you read `data` alone. Telling Jake a run is stopped when
  // the write never landed leaves him watching a bar that will never move.
  it("does not read a failed write as nothing to stop", async () => {
    const { client: c } = client(null, { message: "boom" });
    expect(await stopRun(c, "r1")).toEqual({ ok: false, reason: "failed" });
  });
});
