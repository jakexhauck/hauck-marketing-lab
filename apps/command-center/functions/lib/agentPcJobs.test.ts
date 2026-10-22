import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { pcJob, refused } from "./agentPcJobs";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";

function chat(id: string, tenant_id: string, agent = "ads") {
  return { id, tenant_id, agent, title: id, auto: false, claude_session_id: `s-${id}`, started: true };
}

function message(over: Record<string, unknown> = {}) {
  return { id: M1, chat_id: "c1", role: "me", body: "make the preview", status: "running", meta: {}, created_at: "2026-10-22T10:00:00Z", ...over };
}

function db(msg = message(), chats = [chat("c1", T1)]) {
  return new FakeDb().seed("agent_chats", chats).seed("agent_messages", [msg]);
}

async function made(d: FakeDb) {
  const out = await pcJob(d.client(), { action: "create", messageId: M1, tenantId: T1, payload: { blocks: [] } });
  if (refused(out) || !out.job) throw new Error("not created");
  return out.job;
}

describe("pc jobs", () => {
  it("creates a job for a running Ads turn at that client", async () => {
    const d = db();
    const job = await made(d);
    expect(job).toMatchObject({ messageId: M1, tenantId: T1, status: "queued", payload: { blocks: [] } });
  });

  it("refuses a job for another client, another agent or a finished turn", async () => {
    const other = await pcJob(db().client(), { action: "create", messageId: M1, tenantId: T2, payload: {} });
    expect(other).toMatchObject({ status: 403 });
    const ghl = await pcJob(db(message(), [chat("c1", T1, "ghl")]).client(), { action: "create", messageId: M1, tenantId: T1, payload: {} });
    expect(ghl).toMatchObject({ status: 403 });
    const done = await pcJob(db(message({ status: "done" })).client(), { action: "create", messageId: M1, tenantId: T1, payload: {} });
    expect(done).toMatchObject({ status: 409 });
  });

  it("hands a queued job to one host, which alone may step and finish it", async () => {
    const d = db();
    const job = await made(d);
    const got = await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()));
    expect(got).toMatchObject({ job: { id: job.id, status: "running", host: "pc" } });
    expect(await pcJob(d.client(), { action: "claim", host: "pc2" }, new Date(d.now()))).toEqual({ job: null });

    expect(await pcJob(d.client(), { action: "step", id: job.id, host: "pc2", step: "x" })).toMatchObject({ status: 403 });
    expect(await pcJob(d.client(), { action: "step", id: job.id, host: "pc", step: "Rendering" })).toMatchObject({ job: { step: "Rendering" } });
    expect(await pcJob(d.client(), { action: "finish", id: job.id, host: "pc", result: { notes: ["ok"] } })).toMatchObject({
      job: { status: "done", result: { notes: ["ok"] } },
    });
    expect(await pcJob(d.client(), { action: "finish", id: job.id, host: "pc", result: {} })).toMatchObject({ status: 409 });
  });

  it("records an error finish", async () => {
    const d = db();
    const job = await made(d);
    await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()));
    expect(await pcJob(d.client(), { action: "finish", id: job.id, host: "pc", error: "ffmpeg died" })).toMatchObject({
      job: { status: "error", error: "ffmpeg died" },
    });
  });

  it("cancels instead of handing out a job whose turn already finished", async () => {
    const d = db();
    const job = await made(d);
    d.rows("agent_messages")[0].status = "done";
    expect(await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()))).toEqual({ job: null });
    expect(await pcJob(d.client(), { action: "get", id: job.id })).toMatchObject({ job: { status: "cancelled" } });
  });

  it("hands out nothing queued too long ago, and a new job for the same turn cancels the old one", async () => {
    const d = db();
    const old = await made(d);
    const later = new Date(Date.parse(d.now()) + 4 * 60_000);
    expect(await pcJob(d.client(), { action: "claim", host: "pc" }, later)).toEqual({ job: null });
    expect(await pcJob(d.client(), { action: "get", id: old.id })).toMatchObject({ job: { status: "cancelled" } });

    const d2 = db();
    const first = await made(d2);
    const second = await made(d2);
    expect(await pcJob(d2.client(), { action: "get", id: first.id })).toMatchObject({ job: { status: "cancelled" } });
    expect(await pcJob(d2.client(), { action: "claim", host: "pc" }, new Date(d2.now()))).toMatchObject({ job: { id: second.id } });
  });

  it("cancel stops a running job too, and step then tells the PC to stop", async () => {
    const d = db();
    const job = await made(d);
    await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()));
    expect(await pcJob(d.client(), { action: "cancel", id: job.id })).toMatchObject({ job: { status: "cancelled" } });
    expect(await pcJob(d.client(), { action: "step", id: job.id, host: "pc", step: "Uploading" })).toMatchObject({ status: 409 });
  });

  it("a cancel for queued jobs only leaves a claimed one running", async () => {
    const d = db();
    const job = await made(d);
    await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()));
    expect(await pcJob(d.client(), { action: "cancel", id: job.id, ifStatus: "queued" })).toMatchObject({ job: { status: "running" } });
  });

  it("cancel stops a queued job from being claimed", async () => {
    const d = db();
    const job = await made(d);
    expect(await pcJob(d.client(), { action: "cancel", id: job.id })).toMatchObject({ job: { status: "cancelled" } });
    expect(await pcJob(d.client(), { action: "claim", host: "pc" }, new Date(d.now()))).toEqual({ job: null });
  });

  it("refuses bad input", async () => {
    const d = db();
    expect(await pcJob(d.client(), null)).toMatchObject({ status: 400 });
    expect(await pcJob(d.client(), { action: "claim", host: " " } as never)).toMatchObject({ status: 400 });
    expect(await pcJob(d.client(), { action: "get", id: "nope" })).toMatchObject({ status: 400 });
    expect(await pcJob(d.client(), { action: "finish", id: M1, host: "pc" } as never)).toMatchObject({ status: 404 });
  });
});
