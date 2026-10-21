import { describe, expect, it } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { agentTaskUpdate, withTasks } from "./agentTasks";
import { ensureTasks } from "./clientTasks";
import type { ClaimResponse, RunnerTaskResult } from "../../src/lib/agentWire";

const T1 = "11111111-1111-4111-8111-111111111111";
const C1 = "55555555-5555-4555-8555-555555555555";
const M1 = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-21T12:00:00.000Z");

async function world(agent = "ghl", tenant: string | null = T1, status = "running") {
  const db = new FakeDb()
    .seed("agent_chats", [{ id: C1, tenant_id: tenant, agent, title: "x", auto: false }])
    .seed("agent_messages", [{ id: M1, chat_id: C1, role: "me", body: "Do the A2P", status, meta: {} }]);
  if (tenant) await ensureTasks(db.client(), tenant);
  return db;
}
const row = (db: FakeDb, key: string) => db.rows("client_tasks").find((r) => r.key === key)!;
const A2P = "ghl:a2p-submitted";
const ok = (r: Awaited<ReturnType<typeof agentTaskUpdate>>): RunnerTaskResult => {
  if ("error" in r) throw new Error(r.reason);
  return r;
};

describe("agentTaskUpdate", () => {
  it("moves the agent's own task to doing, then done with evidence, as that agent", async () => {
    const db = await world();
    expect(await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "doing" }] }, now)).toEqual({ updated: [A2P], refused: [] });
    expect(row(db, A2P).state).toBe("doing");
    const res = ok(await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "done", evidence: "Brand BN123 submitted" }] }, now));
    expect(res.updated).toEqual([A2P]);
    expect(row(db, A2P)).toMatchObject({ state: "done", evidence: "Brand BN123 submitted", done_by: "agent:ghl", done_at: now.toISOString() });
  });

  it("saves named outputs with the proof, and says which pairs it dropped", async () => {
    const db = await world();
    const outputs = { dataset_id: "123", "Bad Name": "x", long: "y".repeat(501) };
    const res = ok(await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "done", evidence: "Made", outputs }] }, now));
    expect(res.updated).toEqual([A2P]);
    expect(res.refused).toEqual([{ key: A2P, reason: "outputs dropped: Bad Name, long" }]);
    expect(row(db, A2P).outputs).toEqual({ dataset_id: "123" });
  });

  it("keeps at most 10 outputs", async () => {
    const db = await world();
    const outputs = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, "v"]));
    await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "done", evidence: "Made", outputs }] }, now);
    expect(Object.keys(row(db, A2P).outputs as object)).toHaveLength(10);
  });

  it("refuses by name and writes nothing for: another owner's task, a cut task, an unknown key, done with no proof, a step back", async () => {
    const db = await world();
    row(db, "follow:job-reminders").state = "cut";
    const res = ok(await agentTaskUpdate(
      db.client(),
      {
        messageId: M1,
        updates: [
          { key: "paid:invoice-paid", state: "done", note: "x" },
          { key: "follow:job-reminders", state: "doing" },
          { key: "nope:gone", state: "doing" },
          { key: A2P, state: "done" },
          { key: A2P, state: "todo" as never },
        ],
      },
      now,
    ));
    expect(res.updated).toEqual([]);
    expect(res.refused.map((r) => r.key)).toEqual(["paid:invoice-paid", "follow:job-reminders", "nope:gone", A2P, A2P]);
    expect(row(db, A2P).state).toBe("todo");
    expect(row(db, "paid:invoice-paid").state).toBe("todo");
  });

  it("never moves a done task back to doing", async () => {
    const db = await world();
    row(db, A2P).state = "done";
    const res = ok(await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "doing" }] }, now));
    expect(res.refused).toEqual([{ key: A2P, reason: "already done" }]);
  });

  it("takes the agent and client from the claimed message, never the body", async () => {
    const db = await world("ghl", T1, "done");
    expect(await agentTaskUpdate(db.client(), { messageId: M1, updates: [{ key: A2P, state: "doing" }] }, now)).toMatchObject({ error: 409 });
    const agency = await world("manager", null);
    expect(await agentTaskUpdate(agency.client(), { messageId: M1, updates: [] }, now)).toMatchObject({ error: 403 });
  });

  it("takes at most 50 updates", async () => {
    const db = await world();
    const updates = Array.from({ length: 51 }, () => ({ key: A2P, state: "doing" as const }));
    expect(await agentTaskUpdate(db.client(), { messageId: M1, updates }, now)).toMatchObject({ error: 400 });
  });
});

describe("withTasks", () => {
  const claim = (agent: string, tenantId: string | null) => ({ chat: { agent, tenantId }, tenant: tenantId ? { id: tenantId } : null }) as unknown as ClaimResponse;

  it("gives an agent its own tasks", async () => {
    const db = await world();
    const out = (await withTasks(db.client(), claim("ghl", T1)))!;
    expect(out.tasks!.length).toBeGreaterThan(0);
    expect(out.tasks!.every((t) => t.owner === "ghl")).toBe(true);
  });

  it("gives the Manager every task", async () => {
    const db = await world("csm");
    const out = (await withTasks(db.client(), claim("csm", T1)))!;
    expect(new Set(out.tasks!.map((t) => t.owner)).size).toBeGreaterThan(3);
  });

  it("seeds a client on its first claim, and gives the agency nothing", async () => {
    const db = new FakeDb();
    expect((await withTasks(db.client(), claim("ghl", T1)))!.tasks!.length).toBeGreaterThan(0);
    const agency = new FakeDb();
    expect((await withTasks(agency.client(), claim("manager", null)))!.tasks).toBeUndefined();
    expect(agency.rows("client_tasks")).toHaveLength(0);
  });

  it("passes no claim through", async () => {
    expect(await withTasks(new FakeDb().client(), null)).toBeNull();
  });
});
