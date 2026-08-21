import { describe, it, expect, vi } from "vitest";
import { callableByRun, shapeRun } from "./runs";
import { CALLABLE_LEAD_FILTER } from "../../../lib/leadScraper";

// The number next to a run has to be the number of rows you get when you click
// into it. The run's own tallies cannot do that: they count WRITES, and one
// company found by three of the ten keywords is counted three times. A live run
// on 21 August reported 78 kept for 40 businesses, 16 of them callable, and the
// screen was promising work that was not there.

function client(rows: { run_id: string | null }[] | null, error?: { message: string }) {
  const calls: Record<string, unknown> = {};
  const q = {
    select: vi.fn(() => q),
    match: vi.fn((f: unknown) => { calls.match = f; return q; }),
    in: vi.fn((col: string, ids: string[]) => { calls.in = [col, ids]; return q; }),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: error ?? null })),
  };
  return {
    calls,
    client: { from: vi.fn((t: string) => { calls.from = t; return q; }) } as never,
  };
}

describe("counting what is left to call on a run", () => {
  it("tallies the leads table per run, not the run's own counters", async () => {
    const { client: c } = client([
      { run_id: "a" }, { run_id: "a" }, { run_id: "b" }, { run_id: "a" },
    ]);
    expect(await callableByRun(c, ["a", "b"])).toEqual({ a: 3, b: 1 });
  });

  // If this drifts from the Leads list, the count and the list disagree and one
  // of them is lying to Jake.
  it("counts with exactly the filter the Leads list is built from", async () => {
    const { client: c, calls } = client([]);
    await callableByRun(c, ["a"]);
    expect(calls.from).toBe("cold_sms_outreach_numbers");
    expect(calls.match).toEqual(CALLABLE_LEAD_FILTER);
    expect(calls.match).toEqual({ in_crm: false, line_type: "wireless", send_status: "pending" });
  });

  it("asks only about the runs on the page", async () => {
    const { client: c, calls } = client([]);
    await callableByRun(c, ["a", "b"]);
    expect(calls.in).toEqual(["run_id", ["a", "b"]]);
  });

  it("makes no query at all when there are no runs", async () => {
    const { client: c, calls } = client([]);
    expect(await callableByRun(c, [])).toEqual({});
    expect(calls.from).toBeUndefined();
  });

  // Absent, never zero: "0 to call" on a run holding fifty is worse than a blank.
  it("reports nothing rather than zero when the count cannot be read", async () => {
    const { client: c } = client(null, { message: "boom" });
    expect(await callableByRun(c, ["a"])).toEqual({});
  });

  it("a run with no count of its own carries null, not zero", () => {
    const row = { id: "r1", raw_found: 10, kept_count: 5 } as never;
    expect(shapeRun(row).callable).toBeNull();
    expect(shapeRun(row, 4).callable).toBe(4);
  });
});
