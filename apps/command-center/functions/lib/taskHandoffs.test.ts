import { describe, expect, it } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { readyChildren, startReady, triggerBody } from "./taskHandoffs";
import { applyTaskOps, ensureTasks, patchTask } from "./clientTasks";
import { agentTaskUpdate } from "./agentTasks";
import type { ClientTask } from "../../src/lib/clientTasks";

const T1 = "11111111-1111-4111-8111-111111111111";

const task = (o: Partial<ClientTask>): ClientTask => ({
  id: o.key ?? "x", key: "x", phase: "ghl", owner: "ghl", name: o.key ?? "x", position: 0, sourceNode: null, sopKey: null,
  steps: [], state: "todo", change: "kept", reason: null, evidence: null, note: null, doneBy: null, doneAt: null,
  waitsOn: [], mode: "ask", outputs: {}, ...o,
});

describe("readyChildren", () => {
  const a = task({ key: "a", owner: "ads", state: "done" });
  const b = task({ key: "b", owner: "ads" });

  it("starts a child with two parents only when both are done or cut", () => {
    const child = task({ key: "c", waitsOn: ["a", "b"] });
    expect(readyChildren([a, b, child], ["a"])).toEqual([]);
    expect(readyChildren([a, { ...b, state: "done" }, child], ["b"]).map((t) => t.key)).toEqual(["c"]);
    expect(readyChildren([a, { ...b, state: "cut" }, child], ["b"]).map((t) => t.key)).toEqual(["c"]);
  });

  it("never starts Jake's or the client's task, one already going, or one that waits on nothing", () => {
    const tasks = [
      a,
      task({ key: "j", owner: "jake", waitsOn: ["a"] }),
      task({ key: "cl", owner: "client", waitsOn: ["a"] }),
      task({ key: "d", state: "doing", waitsOn: ["a"] }),
      task({ key: "n" }),
    ];
    expect(readyChildren(tasks, ["a"])).toEqual([]);
  });

  it("only looks at children of what just finished", () => {
    const tasks = [a, task({ key: "z", owner: "done" as never, state: "done" }), task({ key: "c", waitsOn: ["z"] })];
    expect(readyChildren(tasks, ["a"])).toEqual([]);
  });
});

describe("triggerBody", () => {
  it("names each task and hands over each parent's proof and outputs", () => {
    const parent = task({ key: "adsbuild:dataset", name: "Dataset made", owner: "ads", state: "done", evidence: "In Events Manager", outputs: { dataset_id: "123" } });
    const child = task({ key: "follow:capi", name: "CAPI wired", steps: ["Set the dataset value"], waitsOn: ["adsbuild:dataset"] });
    const text = triggerBody([child], [parent]);
    expect(text).toContain("follow:capi: CAPI wired");
    expect(text).toContain("1. Set the dataset value");
    expect(text).toContain("Handed over");
    expect(text).toContain("Dataset made (Ads): In Events Manager");
    expect(text).toContain("dataset_id: 123");
  });
});

async function chain(mode: "ask" | "live" = "ask") {
  const db = new FakeDb();
  const all = await ensureTasks(db.client(), T1);
  const parent = all.find((t) => t.owner === "ads")!;
  const other = all.find((t) => t.owner === "jake")!;
  const ghl = all.filter((t) => t.owner === "ghl").slice(0, 3);
  for (const c of ghl) await patchTask(db.client(), T1, c.id, { waitsOn: [parent.key], mode }, "jake");
  return { db, parent, other, ghl };
}
const triggers = (db: FakeDb) => db.rows("agent_messages").filter((m) => m.role === "trigger");

describe("startReady", () => {
  it("starts what waits on a finished task once, in one trigger per agent", async () => {
    const { db, parent, ghl } = await chain();
    await patchTask(db.client(), T1, parent.id, { state: "done" }, "jake");
    const t = triggers(db);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ status: "queued", meta: { taskKeys: ghl.map((g) => g.key), live: false } });
    const chat = db.rows("agent_chats").find((c) => c.id === t[0].chat_id)!;
    expect(chat).toMatchObject({ tenant_id: T1, agent: "ghl", title: "Tasks" });
    for (const g of ghl) expect(db.rows("client_tasks").find((r) => r.id === g.id)!.state).toBe("doing");
  });

  it("two finishes at once start the shared child exactly once", async () => {
    const { db, parent } = await chain();
    await patchTask(db.client(), T1, parent.id, { state: "done" }, "jake");
    db.rows("agent_messages").length = 0;
    const res = await Promise.all([startReady(db.client(), T1, [parent.key]), startReady(db.client(), T1, [parent.key])]);
    expect(res.flatMap((r) => r.started)).toEqual([]);
    expect(triggers(db)).toHaveLength(0);
  });

  it("a race on a fresh finish starts each child once", async () => {
    const { db, parent, ghl } = await chain();
    db.rows("client_tasks").find((r) => r.id === parent.id)!.state = "done";
    const res = await Promise.all([startReady(db.client(), T1, [parent.key]), startReady(db.client(), T1, [parent.key])]);
    const keys = ghl.map((g) => g.key).sort();
    expect(res.flatMap((r) => r.started).sort()).toEqual(keys);
    expect(triggers(db).flatMap((m) => (m.meta as { taskKeys: string[] }).taskKeys).sort()).toEqual(keys);
  });

  it("goes in the same Tasks chat next time", async () => {
    const { db, parent, other } = await chain();
    await patchTask(db.client(), T1, parent.id, { state: "done" }, "jake");
    const next = (await ensureTasks(db.client(), T1)).find((t) => t.owner === "ghl" && t.state === "todo")!;
    await patchTask(db.client(), T1, next.id, { waitsOn: [other.key] }, "jake");
    await patchTask(db.client(), T1, other.id, { state: "done" }, "jake");
    const t = triggers(db);
    expect(t).toHaveLength(2);
    expect(t[0].chat_id).toBe(t[1].chat_id);
  });

  it("is live only when every task in the trigger acts live", async () => {
    const { db, parent } = await chain("live");
    await patchTask(db.client(), T1, parent.id, { state: "done" }, "jake");
    expect(triggers(db)[0].meta).toMatchObject({ live: true });
  });

  it("a cut on a kickoff card starts what waits on it", async () => {
    const { db, parent } = await chain();
    await applyTaskOps(db.client(), T1, [{ op: "cut", key: parent.key, reason: "Not needed" }], "jake");
    expect(triggers(db)).toHaveLength(1);
  });

  it("an agent finishing its task in a turn starts what waits on it", async () => {
    const { db, parent } = await chain();
    db.seed("agent_chats", [{ id: "77777777-7777-4777-8777-777777777777", tenant_id: T1, agent: "ads", title: "x", auto: false }]);
    db.seed("agent_messages", [{ id: "66666666-6666-4666-8666-666666666666", chat_id: "77777777-7777-4777-8777-777777777777", role: "me", body: "Do it", status: "running", meta: {} }]);
    const res = await agentTaskUpdate(db.client(), { messageId: "66666666-6666-4666-8666-666666666666", updates: [{ key: parent.key, state: "done", evidence: "Made", outputs: { dataset_id: "9" } }] });
    expect(res).toMatchObject({ updated: [parent.key] });
    const t = triggers(db);
    expect(t).toHaveLength(1);
    expect(t[0].body).toContain("dataset_id: 9");
  });

  it("puts a task back to do when its trigger could not be queued, and still starts the other agents", async () => {
    const { db, parent, ghl } = await chain();
    const research = (await ensureTasks(db.client(), T1)).find((t) => t.owner === "csm" && t.state === "todo")!;
    await patchTask(db.client(), T1, research.id, { waitsOn: [parent.key] }, "jake");
    db.rows("client_tasks").find((r) => r.id === parent.id)!.state = "done";
    const real = db.client();
    let failed = false;
    const flaky = {
      ...real,
      from: (table: string) => {
        if (table === "agent_messages" && !failed) {
          failed = true;
          return { insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }) };
        }
        return real.from(table);
      },
    } as unknown as typeof real;
    const res = await startReady(flaky, T1, [parent.key]);
    const state = (id: string) => db.rows("client_tasks").find((r) => r.id === id)!.state;
    const groups = [ghl.map((g) => g.id), [research.id]];
    const looks = groups.map((ids) => [...new Set(ids.map(state))]);
    // One agent's trigger failed: its tasks are to do again. The other's went out.
    expect(looks.map((l) => l.join()).sort()).toEqual(["doing", "todo"]);
    expect(triggers(db)).toHaveLength(1);
    expect(res.started).toHaveLength(looks[0][0] === "doing" ? ghl.length : 1);
  });

  it("an untick or a doing starts nothing", async () => {
    const { db, parent } = await chain();
    await patchTask(db.client(), T1, parent.id, { state: "doing" }, "jake");
    expect(triggers(db)).toHaveLength(0);
  });
});
