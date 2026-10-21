import { describe, it, expect, vi } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { agentSaveBrief, readBrief, readBriefDrive, saveBriefSection, seedClientSection, withBrief } from "./clientBriefs";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const C1 = "55555555-5555-4555-8555-555555555555";
const M1 = "33333333-3333-4333-8333-333333333333";
const EM = String.fromCharCode(0x2014);
const now = new Date("2026-10-17T12:00:00.000Z");

const row = (over: Record<string, unknown> = {}) => ({
  tenant_id: T1,
  section: "ads",
  body: "Cap $40/day",
  version: 3,
  updated_by: "jake",
  updated_at: "2026-10-17T10:00:00.000Z",
  ...over,
});

describe("readBrief", () => {
  it("is every section in order, this client's rows only", async () => {
    const db = new FakeDb().seed("client_briefs", [row(), row({ tenant_id: T2, section: "ghl", body: "other client" })]);
    const out = await readBrief(db.client(), T1);
    expect(out).toHaveLength(7);
    expect(out.find((s) => s.section === "ads")).toEqual({
      section: "ads",
      body: "Cap $40/day",
      version: 3,
      updatedBy: "jake",
      updatedAt: "2026-10-17T10:00:00.000Z",
    });
    expect(out.find((s) => s.section === "ghl")?.version).toBe(0);
  });
});

describe("saveBriefSection", () => {
  it("writes the first version of a section nobody wrote", async () => {
    const db = new FakeDb();
    const res = await saveBriefSection(db.client(), { tenantId: T1, section: "research", body: "Top pain: cold", version: 0, by: "jake" }, now);
    expect(res).toEqual({
      saved: { section: "research", body: "Top pain: cold", version: 1, updatedBy: "jake", updatedAt: now.toISOString() },
    });
    expect(db.rows("client_briefs")).toHaveLength(1);
  });

  it("bumps the version when the save names the current one", async () => {
    const db = new FakeDb().seed("client_briefs", [row()]);
    const res = await saveBriefSection(db.client(), { tenantId: T1, section: "ads", body: "Cap $50/day", version: 3, by: "ads" }, now);
    expect("saved" in res && res.saved).toMatchObject({ body: "Cap $50/day", version: 4, updatedBy: "ads" });
    expect(db.rows("client_briefs")[0]).toMatchObject({ body: "Cap $50/day", version: 4, updated_by: "ads" });
  });

  it("refuses a stale version with the current section, and changes nothing", async () => {
    const db = new FakeDb().seed("client_briefs", [row()]);
    const res = await saveBriefSection(db.client(), { tenantId: T1, section: "ads", body: "old view", version: 2, by: "ads" }, now);
    expect(res).toEqual({
      conflict: { section: "ads", body: "Cap $40/day", version: 3, updatedBy: "jake", updatedAt: "2026-10-17T10:00:00.000Z" },
    });
    expect(db.rows("client_briefs")[0]).toMatchObject({ body: "Cap $40/day", version: 3 });
  });

  it("refuses version 0 once someone has written the section", async () => {
    const db = new FakeDb().seed("client_briefs", [row()]);
    const res = await saveBriefSection(db.client(), { tenantId: T1, section: "ads", body: "fresh", version: 0, by: "ads" }, now);
    expect("conflict" in res).toBe(true);
    expect(db.rows("client_briefs")).toHaveLength(1);
  });

  it("refuses a bad section, version or body", async () => {
    const db = new FakeDb();
    const base = { tenantId: T1, section: "ads" as const, body: "x", version: 0, by: "jake" as const };
    expect(await saveBriefSection(db.client(), { ...base, section: "nope" as never }, now)).toMatchObject({ error: 400 });
    expect(await saveBriefSection(db.client(), { ...base, version: -1 }, now)).toMatchObject({ error: 400 });
    expect(await saveBriefSection(db.client(), { ...base, version: 1.5 }, now)).toMatchObject({ error: 400 });
    expect(await saveBriefSection(db.client(), { ...base, body: "x".repeat(20_001) }, now)).toMatchObject({ error: 400 });
    expect(await saveBriefSection(db.client(), { ...base, tenantId: "agency" }, now)).toMatchObject({ error: 400 });
  });
});

function world(over: { agent?: string; tenant?: string | null; status?: string; role?: string } = {}) {
  return new FakeDb()
    .seed("agent_chats", [{ id: C1, tenant_id: over.tenant === undefined ? T1 : over.tenant, agent: over.agent ?? "research", title: "Map", auto: false }])
    .seed("agent_messages", [{ id: M1, chat_id: C1, role: over.role ?? "me", body: "Map it", status: over.status ?? "running", meta: {} }]);
}

describe("agentSaveBrief", () => {
  it("writes the agent's own section, named by its chat, as that agent", async () => {
    const db = world();
    const res = await agentSaveBrief(db.client(), { messageId: M1, body: `Top pain ${EM} cold`, version: 0 }, now);
    expect(res).toMatchObject({ tenantId: T1, saved: { section: "research", version: 1, updatedBy: "research", body: "Top pain, cold" } });
  });

  it("cannot reach another agent's section: there is no section in the request to aim with", async () => {
    const db = world({ agent: "ads" }).seed("client_briefs", [row({ section: "research", body: "Jake's research", version: 2 })]);
    const res = await agentSaveBrief(db.client(), { messageId: M1, body: "overwrite", version: 2, section: "research" } as never, now);
    // Version 2 is the research section's; the ads section is unwritten, so this
    // is a stale write to ads, and research is untouched.
    expect("conflict" in res && res.conflict.section).toBe("ads");
    expect(db.rows("client_briefs").find((r) => r.section === "research")).toMatchObject({ body: "Jake's research", version: 2 });
  });

  it("refuses a stale version with the current text (Jake edited it)", async () => {
    const db = world().seed("client_briefs", [row({ section: "research", body: "Jake's edit", version: 4 })]);
    const res = await agentSaveBrief(db.client(), { messageId: M1, body: "agent text", version: 3 }, now);
    expect(res).toMatchObject({ tenantId: T1, conflict: { section: "research", body: "Jake's edit", version: 4, updatedBy: "jake" } });
    expect(db.rows("client_briefs")[0]).toMatchObject({ body: "Jake's edit", version: 4 });
  });

  it("refuses a message that is not running, not Jake's, unknown, or at the agency", async () => {
    expect(await agentSaveBrief(world({ status: "done" }).client(), { messageId: M1, body: "x", version: 0 }, now)).toMatchObject({ error: 409 });
    expect(await agentSaveBrief(world({ role: "ai" }).client(), { messageId: M1, body: "x", version: 0 }, now)).toMatchObject({ error: 404 });
    expect(
      await agentSaveBrief(world().client(), { messageId: "44444444-4444-4444-8444-444444444444", body: "x", version: 0 }, now),
    ).toMatchObject({ error: 404 });
    expect(await agentSaveBrief(world({ tenant: null, agent: "manager" }).client(), { messageId: M1, body: "x", version: 0 }, now)).toMatchObject({
      error: 403,
    });
    expect(await agentSaveBrief(world().client(), { messageId: "nope", body: "x", version: 0 }, now)).toMatchObject({ error: 400 });
  });
});

describe("readBriefDrive", () => {
  it("is null before the first sync, then the doc and its state", async () => {
    const db = new FakeDb();
    expect(await readBriefDrive(db.client(), T1)).toBeNull();
    db.seed("client_brief_drive", [{ tenant_id: T1, doc_id: "d1", doc_url: "https://docs.google.com/document/d/d1/edit", revision: 4, synced_at: "2026-10-17T11:00:00.000Z", error: null }]);
    expect(await readBriefDrive(db.client(), T1)).toEqual({
      docUrl: "https://docs.google.com/document/d/d1/edit",
      syncedAt: "2026-10-17T11:00:00.000Z",
      error: null,
      revision: 4,
    });
  });
});

describe("withBrief", () => {
  it("adds the client's whole brief to a claim, and none at the agency", async () => {
    const db = new FakeDb().seed("client_briefs", [row()]);
    const core = { message: {} as never, chat: {} as never, history: [], tenant: { id: T1, name: "W", slug: "w", metaAdAccountId: null } };
    const res = await withBrief(db.client(), core);
    expect(res?.brief).toHaveLength(7);
    expect(res?.brief.find((s) => s.section === "ads")?.version).toBe(3);
    expect((await withBrief(db.client(), { ...core, tenant: null }))?.brief).toEqual([]);
    expect(await withBrief(db.client(), null)).toBeNull();
  });

  it("never fails the claim when the brief cannot be read: an empty brief, logged", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { from: () => { throw new Error("db down"); } } as never;
    const core = { message: {} as never, chat: {} as never, history: [], tenant: { id: T1, name: "W", slug: "w", metaAdAccountId: null } };
    const res = await withBrief(broken, core);
    expect(res).toMatchObject({ tenant: core.tenant, brief: [] });
    expect(String(warn.mock.calls[0]?.join(" "))).toMatch(/brief.*db down/);
    warn.mockRestore();
  });
});

describe("seedClientSection", () => {
  const intake = { name: "Willis Windows", contactName: "Bill", ghl_token: "pit-secret-123" };

  it("writes the Client section from the form once, as Jake's, with secrets on file", async () => {
    const db = new FakeDb()
      .seed("onboarding", [{ tenant_id: T1, intake }])
      .seed("intake_submissions", [{ tenant_id: T1, password_plain: "hunter2!", created_at: "2026-10-01T00:00:00Z" }]);
    const res = await seedClientSection(db.client(), T1, await readBrief(db.client(), T1), now);
    expect(res.seeded).toBe(true);
    const sec = res.sections.find((s) => s.section === "client");
    expect(sec).toMatchObject({ version: 1, updatedBy: "jake" });
    expect(sec?.body).toContain("- Business name: Willis Windows");
    expect(sec?.body).toContain("- Password: on file");
    expect(sec?.body).not.toContain("hunter2");
    expect(sec?.body).not.toContain("pit-secret-123");
    expect(db.rows("client_briefs")).toHaveLength(1);
  });

  it("leaves a written Client section alone, and does nothing without answers", async () => {
    const db = new FakeDb()
      .seed("onboarding", [{ tenant_id: T1, intake }])
      .seed("client_briefs", [row({ section: "client", body: "Jake's notes", version: 2 })]);
    const res = await seedClientSection(db.client(), T1, await readBrief(db.client(), T1), now);
    expect(res.seeded).toBe(false);
    expect(res.sections.find((s) => s.section === "client")?.body).toBe("Jake's notes");

    const empty = new FakeDb();
    expect((await seedClientSection(empty.client(), T1, await readBrief(empty.client(), T1), now)).seeded).toBe(false);
    expect(empty.rows("client_briefs")).toHaveLength(0);
  });
});

describe("withBrief, no boxes", () => {
  it("sends the sections with no boxes: tasks live on the Director now", async () => {
    const db0 = new FakeDb();
    const core0 = { message: {} as never, chat: {} as never, history: [], tenant: { id: T1, name: "W", slug: "w", metaAdAccountId: null } };
    const res0 = await withBrief(db0.client(), core0);
    expect(res0!.brief.every((s) => !("boxes" in s))).toBe(true);
  });


});
