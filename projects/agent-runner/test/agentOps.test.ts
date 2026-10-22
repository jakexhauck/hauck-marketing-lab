import { describe, expect, it } from "vitest";
import { healthFrom, jobsFrom, opsLoop, readAgent, usageByDay } from "../src/agentOps.ts";
import type { AgentOpsBody } from "../src/wire.ts";

const NOW = new Date("2026-10-22T15:00:00.000Z");
const sec = (iso: string) => Date.parse(iso) / 1000;

describe("usageByDay", () => {
  it("sums sessions per UTC day over 30 days, preferring an actual cost", () => {
    const days = usageByDay(
      [
        { started_at: sec("2026-10-22T01:00:00Z"), input_tokens: 10, output_tokens: 5, cache_read_tokens: 100, api_call_count: 2, estimated_cost_usd: 0.1 },
        { started_at: sec("2026-10-22T09:00:00Z"), input_tokens: 20, output_tokens: 5, estimated_cost_usd: 0.2, actual_cost_usd: 0.15 },
        { started_at: sec("2026-10-21T23:00:00Z"), estimated_cost_usd: 1 },
        { started_at: sec("2026-08-01T00:00:00Z"), estimated_cost_usd: 99 },
        { started_at: null },
      ],
      NOW,
    );
    expect(days.map((d) => d.day)).toEqual(["2026-10-21", "2026-10-22"]);
    expect(days[1]).toMatchObject({ sessions: 2, inputTokens: 30, outputTokens: 10, cacheReadTokens: 100, apiCalls: 2, estCostUsd: 0.25 });
  });
});

describe("healthFrom", () => {
  it("reads Hermes's detailed health and an unreachable profile", () => {
    expect(healthFrom({ status: "ok", gateway_state: "running", platforms: { api_server: { error_message: null } } }, null)).toEqual({ status: "ok", gateway: "running", error: null });
    expect(healthFrom(null, "health check failed: 502")).toEqual({ status: "unreachable", gateway: null, error: "health check failed: 502" });
  });
});

describe("jobsFrom", () => {
  it("reads a job list and marks a paused one", () => {
    expect(jobsFrom({ jobs: [{ id: "j1", name: "Weekly", schedule: "0 9 * * 1", paused: true, next_run_at: 1792900000 }, { name: "no id" }] })).toEqual([
      { id: "j1", name: "Weekly", schedule: "0 9 * * 1", enabled: false, nextRunAt: new Date(1792900000 * 1000).toISOString(), lastRunAt: null, lastStatus: null },
    ]);
  });
});

function hermes(routes: Record<string, unknown>, seen: string[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.push(`${init?.method ?? "GET"} ${url} ${(init?.headers as Record<string, string>)?.authorization}`);
    const path = url.replace("http://h", "");
    if (!(path in routes)) return new Response("nope", { status: 404 });
    const v = routes[path];
    return v instanceof Response ? v : new Response(JSON.stringify(v), { status: 200 });
  }) as typeof fetch;
}

describe("readAgent", () => {
  it("asks each profile with its own key, and reports a down one without the rest", async () => {
    const seen: string[] = [];
    const f = hermes(
      {
        "/p/ads/health/detailed": { status: "ok", gateway_state: "running" },
        "/p/ads/api/sessions?limit=500": { data: [{ started_at: sec("2026-10-22T10:00:00Z"), estimated_cost_usd: 0.5 }] },
        "/p/ads/api/jobs": { jobs: [] },
      },
      seen,
    );
    const d = { base: "http://h", keys: { ads: "k-ads", csm: "k-csm" }, skills: { ads: ["ads"] }, fetchImpl: f, now: () => NOW };
    const ads = await readAgent("ads", d);
    expect(ads).toMatchObject({ agent: "ads", health: { status: "ok" }, skills: ["ads"], usage: [{ day: "2026-10-22", estCostUsd: 0.5 }] });
    expect(seen.every((s) => s.endsWith("Bearer k-ads"))).toBe(true);
    const csm = await readAgent("csm", d);
    expect(csm?.health.status).toBe("unreachable");
    expect(await readAgent("ghl", d)).toBeNull();
  });
});

describe("opsLoop", () => {
  it("runs Jake's queued command and reports it straight away", async () => {
    const seen: string[] = [];
    const f = hermes(
      {
        "/p/ads/health/detailed": { status: "ok" },
        "/p/ads/api/sessions?limit=500": { data: [] },
        "/p/ads/api/jobs": { jobs: [{ id: "j1", name: "Weekly", schedule: "x" }] },
        "/p/ads/api/jobs/j1/pause": { ok: true },
      },
      seen,
    );
    const posts: AgentOpsBody[] = [];
    let first = true;
    const round = opsLoop(["ads"], { base: "http://h", keys: { ads: "k" }, skills: {}, fetchImpl: f, now: () => NOW }, async (b) => {
      posts.push(b);
      const commands = first ? [{ id: "c1", agent: "ads" as const, jobId: "j1", action: "pause" as const }] : [];
      first = false;
      return { commands };
    });
    await round();
    expect(seen).toContain("POST http://h/p/ads/api/jobs/j1/pause Bearer k");
    expect(posts).toHaveLength(2);
    expect(posts[1].done).toEqual([{ id: "c1", ok: true, result: "pause done" }]);
  });
});
