import { describe, expect, it } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { queueJobCommand, readAgentOps, saveAgentOps, sumDays } from "./agentOps";
import type { AgentOpsReport, AgentUsageDay } from "../../src/lib/agentWire";

const day = (d: string, cost: number, sessions = 1): AgentUsageDay => ({
  day: d,
  sessions,
  apiCalls: 2,
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 1000,
  cacheWriteTokens: 10,
  estCostUsd: cost,
});

const report = (over: Partial<AgentOpsReport> = {}): AgentOpsReport => ({
  agent: "ads",
  health: { status: "ok", gateway: "running", error: null },
  jobs: [{ id: "j1", name: "Weekly check", schedule: "0 9 * * 1", enabled: true, nextRunAt: null, lastRunAt: null, lastStatus: null }],
  skills: ["ads", "copywriting"],
  usage: [day("2026-10-21", 0.5), day("2026-10-22", 0.25)],
  ...over,
});

const NOW = new Date("2026-10-22T15:00:00.000Z");

describe("saveAgentOps", () => {
  it("saves each agent's read and rewrites the days it sent, never adding them twice", async () => {
    const db = new FakeDb();
    await saveAgentOps(db.client(), { agents: [report()], done: [] }, NOW);
    await saveAgentOps(db.client(), { agents: [report({ usage: [day("2026-10-22", 0.75, 3)] })], done: [] }, NOW);
    expect(db.rows("agent_ops")).toHaveLength(1);
    const rows = db.rows("agent_usage_daily");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.day === "2026-10-22")).toMatchObject({ sessions: 3, est_cost_usd: 0.75 });
  });

  it("drops an unknown agent and a malformed day", async () => {
    const db = new FakeDb();
    const bad = { ...report(), agent: "intern" } as unknown as AgentOpsReport;
    await saveAgentOps(db.client(), { agents: [bad, report({ usage: [{ ...day("x", 1) }] })], done: [] }, NOW);
    expect(db.rows("agent_ops").map((r) => r.agent)).toEqual(["ads"]);
    expect(db.rows("agent_usage_daily")).toHaveLength(0);
  });

  it("hands the runner the queued commands and closes the ones it reports", async () => {
    const db = new FakeDb();
    await saveAgentOps(db.client(), { agents: [report()], done: [] }, NOW);
    const q = await queueJobCommand(db.client(), "ads", "j1", "pause");
    if ("error" in q) throw new Error("not queued");
    const first = await saveAgentOps(db.client(), { agents: [], done: [] }, NOW);
    expect(first).toEqual({ commands: [{ id: q.id, agent: "ads", jobId: "j1", action: "pause" }] });
    const second = await saveAgentOps(db.client(), { agents: [], done: [{ id: q.id, ok: true, result: "paused" }] }, NOW);
    expect(second).toEqual({ commands: [] });
    expect(db.rows("agent_ops_commands")[0]).toMatchObject({ status: "done", result: "paused" });
  });
});

describe("queueJobCommand", () => {
  it("refuses a job the runner never reported, and a bad action", async () => {
    const db = new FakeDb();
    await saveAgentOps(db.client(), { agents: [report()], done: [] }, NOW);
    expect(await queueJobCommand(db.client(), "ads", "nope", "run")).toMatchObject({ error: 404 });
    expect(await queueJobCommand(db.client(), "ads", "j1", "delete")).toMatchObject({ error: 400 });
    expect(await queueJobCommand(db.client(), "intern", "j1", "run")).toMatchObject({ error: 400 });
  });
});

describe("readAgentOps", () => {
  it("adds up today, the week and the month, and finds the last turn and failure", async () => {
    const db = new FakeDb();
    await saveAgentOps(db.client(), { agents: [report({ usage: [day("2026-09-01", 9), day("2026-10-10", 1), day("2026-10-21", 0.5), day("2026-10-22", 0.25)] })], done: [] }, NOW);
    db.seed("agent_runner_state", [
      { host: "hauck-vps", last_seen_at: "2026-10-22T14:59:30.000Z" },
      { host: "JAKE-PC", last_seen_at: "2026-10-20T10:00:00.000Z" },
    ]);
    db.seed("agent_chats", [{ id: "c1", agent: "ads", updated_at: "2026-10-22T14:00:00.000Z" }]);
    db.seed("agent_messages", [
      { id: "m1", chat_id: "c1", role: "ai", status: "error", error: "hermes 500", created_at: "2026-10-22T13:00:00.000Z" },
      { id: "m2", chat_id: "c1", role: "ai", status: "done", error: null, created_at: "2026-10-22T14:00:00.000Z" },
    ]);
    const v = await readAgentOps(db.client(), "ads", NOW);
    expect(v.usage.today.estCostUsd).toBe(0.25);
    expect(v.usage.week.estCostUsd).toBe(0.75);
    expect(v.usage.month.estCostUsd).toBe(1.75);
    expect(v.runner.online).toBe(true);
    expect(v.lastTurnAt).toBe("2026-10-22T14:00:00.000Z");
    expect(v.lastError).toEqual({ at: "2026-10-22T13:00:00.000Z", error: "hermes 500" });
    expect(v.skills).toEqual(["ads", "copywriting"]);
    expect(v.jobs[0].id).toBe("j1");
  });

  it("is empty, not broken, before the first read", async () => {
    const v = await readAgentOps(new FakeDb().client(), "csm", NOW);
    expect(v).toMatchObject({ collectedAt: null, health: null, jobs: [], lastTurnAt: null, lastError: null });
    expect(v.usage.month.sessions).toBe(0);
  });
});

describe("sumDays", () => {
  it("rounds the cost to the cent's hundredth", () => {
    expect(sumDays([day("a", 0.1), day("b", 0.2)], "t").estCostUsd).toBe(0.3);
  });
});
