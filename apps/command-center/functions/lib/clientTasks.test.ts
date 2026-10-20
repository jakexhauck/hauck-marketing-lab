import { describe, expect, it } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { applyTaskOps, createTask, deleteTask, ensureTasks, patchTask } from "./clientTasks";
import { seedTasks } from "../../src/lib/clientTasks";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const invoice = () => seedTasks().find((t) => t.name === "Invoice Paid")!;

describe("ensureTasks", () => {
  it("seeds a client once from the map, in phase and position order", async () => {
    const db = new FakeDb();
    const first = await ensureTasks(db.client(), T1);
    expect(first).toHaveLength(seedTasks().length);
    expect(first[0].phase).toBe("paid");
    await ensureTasks(db.client(), T1);
    expect(db.rows("client_tasks")).toHaveLength(seedTasks().length);
  });

  it("two first reads at once still seed one set", async () => {
    const db = new FakeDb();
    await Promise.all([ensureTasks(db.client(), T1), ensureTasks(db.client(), T1)]);
    expect(db.rows("client_tasks")).toHaveLength(seedTasks().length);
  });

  it("carries the client's old ticks over as done, and only that client's", async () => {
    const db = new FakeDb().seed("onboarding_checklist", [
      { tenant_id: T1, task_key: invoice().sopKey, done: true, done_by: "agent:manager", done_at: "2026-10-01T00:00:00.000Z" },
      { tenant_id: T2, task_key: invoice().sopKey, done: true, done_by: "x", done_at: "2026-10-01T00:00:00.000Z" },
    ]);
    const tasks = await ensureTasks(db.client(), T1);
    expect(tasks.find((t) => t.key === invoice().key)).toMatchObject({ state: "done", doneBy: "agent:manager" });
    expect(tasks.filter((t) => t.state === "done")).toHaveLength(1);
  });
});

describe("patchTask", () => {
  it("done stamps who and when; Jake can untick", async () => {
    const db = new FakeDb();
    const [t] = await ensureTasks(db.client(), T1);
    const done = await patchTask(db.client(), T1, t.id, { state: "done" }, "jake");
    expect(done).toMatchObject({ state: "done", doneBy: "jake", doneAt: expect.any(String) });
    const back = await patchTask(db.client(), T1, t.id, { state: "todo" }, "jake");
    expect(back).toMatchObject({ state: "todo", doneBy: null, doneAt: null });
  });

  it("refuses an unknown owner or phase, and another client's task", async () => {
    const db = new FakeDb();
    const [t] = await ensureTasks(db.client(), T1);
    expect(await patchTask(db.client(), T1, t.id, { owner: "intern" as never }, "jake")).toMatchObject({ error: 400 });
    expect(await patchTask(db.client(), T1, t.id, { phase: "nowhere" }, "jake")).toMatchObject({ error: 400 });
    expect(await patchTask(db.client(), T2, t.id, { name: "x" }, "jake")).toMatchObject({ error: 404 });
  });
});

describe("createTask and deleteTask", () => {
  it("an added task is marked added with an added: key, suffixed on a clash", async () => {
    const db = new FakeDb();
    await ensureTasks(db.client(), T1);
    const a = await createTask(db.client(), T1, { phase: "ghl", owner: "ghl", name: "Spanish ads" }, "jake");
    const b = await createTask(db.client(), T1, { phase: "ghl", owner: "ghl", name: "Spanish ads" }, "jake");
    expect(a).toMatchObject({ key: "added:spanish-ads", change: "added", state: "todo" });
    expect(b).toMatchObject({ key: "added:spanish-ads-2" });
  });

  it("deletes only within the client", async () => {
    const db = new FakeDb();
    const [t] = await ensureTasks(db.client(), T1);
    expect(await deleteTask(db.client(), T2, t.id)).toBe(false);
    expect(await deleteTask(db.client(), T1, t.id)).toBe(true);
    expect(db.rows("client_tasks").some((r) => r.id === t.id)).toBe(false);
  });
});

describe("applyTaskOps", () => {
  it("adds, changes and cuts by key, and skips a missing key with a reason", async () => {
    const db = new FakeDb();
    await ensureTasks(db.client(), T1);
    const res = await applyTaskOps(
      db.client(),
      T1,
      [
        { op: "add", phase: "ghl", owner: "client", name: "Ask: who answers the phone", reason: "Not on the intake" },
        { op: "change", key: invoice().key, owner: "jake", reason: "Jake chases the invoice" },
        { op: "cut", key: "follow:job-reminders", reason: "No jobs in GHL" },
        { op: "cut", key: "nope:gone", reason: "x" },
      ],
      "jake",
    );
    expect(res.applied).toBe(3);
    expect(res.skipped).toEqual([{ op: { op: "cut", key: "nope:gone", reason: "x" }, reason: "no task with that key" }]);
    const rows = db.rows("client_tasks");
    expect(rows.find((r) => r.key === "added:ask-who-answers-the-phone")).toMatchObject({ change: "added", owner: "client", reason: "Not on the intake" });
    expect(rows.find((r) => r.key === invoice().key)).toMatchObject({ change: "changed", owner: "jake", reason: "Jake chases the invoice" });
    expect(rows.find((r) => r.key === "follow:job-reminders")).toMatchObject({ state: "cut", reason: "No jobs in GHL" });
  });

  it("seeds first when the client has no tasks yet", async () => {
    const db = new FakeDb();
    const res = await applyTaskOps(db.client(), T1, [{ op: "cut", key: "follow:job-reminders", reason: "x" }], "jake");
    expect(res.applied).toBe(1);
    expect(db.rows("client_tasks")).toHaveLength(seedTasks().length);
  });
});
