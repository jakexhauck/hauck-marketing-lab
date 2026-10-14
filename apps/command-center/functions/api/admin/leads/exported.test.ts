import { describe, it, expect, vi } from "vitest";
import { exportedLabel, markExported } from "./exported";

// "Remove from list" on the Leads CSV. One filtered write, and the filter is the
// safety: only a lead still waiting is taken off, so a number sent or opted out in
// the meantime keeps saying where it went.

function client(data: unknown, error?: { message: string }) {
  const calls: Record<string, unknown> = {};
  const q = {
    update: vi.fn((patch: unknown) => { calls.update = patch; return q; }),
    in: vi.fn((col: string, v: string[]) => { calls.in = [col, v]; return q; }),
    eq: vi.fn((col: string, v: string) => { calls.eq = [col, v]; return q; }),
    select: vi.fn(() => Promise.resolve({ data, error: error ?? null })),
  };
  return {
    calls,
    client: { from: vi.fn((t: string) => { calls.from = t; return q; }) } as never,
  };
}

const NOW = new Date("2026-09-21T15:00:00Z");

describe("taking exported leads off the list", () => {
  it("stamps the ticked leads and reports how many moved", async () => {
    const { client: c, calls } = client([{ id: "a" }, { id: "b" }]);
    expect(await markExported(c, ["a", "b"], NOW)).toEqual({ ok: true, marked: 2 });
    expect(calls.from).toBe("cold_sms_outreach_numbers");
    expect(calls.in).toEqual(["id", ["a", "b"]]);
    const patch = calls.update as Record<string, string>;
    expect(patch.send_status).toBe("csv_20260921_exported");
    expect(patch.sent_to).toBe("csv");
    expect(patch.sent_at).toBe(NOW.toISOString());
  });

  it("only ever touches a lead that is still waiting", async () => {
    const { client: c, calls } = client([]);
    await markExported(c, ["a"], NOW);
    expect(calls.eq).toEqual(["send_status", "pending"]);
  });

  // `_queued` is how the Return to leads path recognises the power dialer.
  it("is never mistaken for a lead on the power dialer", () => {
    expect(exportedLabel(NOW)).not.toContain("queued");
  });

  it("does not read a failed write as nothing to mark", async () => {
    const { client: c } = client(null, { message: "boom" });
    expect(await markExported(c, ["a"], NOW)).toEqual({ ok: false });
  });
});
