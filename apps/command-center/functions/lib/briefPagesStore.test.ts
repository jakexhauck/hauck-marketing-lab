import { describe, expect, it } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { agentSavePage, readPages, savePage } from "./briefPagesStore";
import type { AdsPage, ResearchPage } from "../../src/lib/briefPages";

const T1 = "11111111-1111-4111-8111-111111111111";
const C1 = "55555555-5555-4555-8555-555555555555";
const M1 = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-22T12:00:00.000Z");

function world(agent = "research") {
  return new FakeDb()
    .seed("agent_chats", [{ id: C1, tenant_id: T1, agent, title: "Plan", auto: false }])
    .seed("agent_messages", [{ id: M1, chat_id: C1, role: "me", body: "Fill it", status: "running", meta: {} }]);
}

describe("readPages", () => {
  it("is both pages, unwritten ones empty at version 0", async () => {
    const out = await readPages(new FakeDb().client(), T1);
    expect(out.map((p) => [p.page, p.version])).toEqual([
      ["research", 0],
      ["ads", 0],
    ]);
    expect((out[1].data as AdsPage).campaigns).toEqual([]);
  });
});

describe("savePage", () => {
  it("writes version 1 first, then refuses a stale version with the current row", async () => {
    const db = new FakeDb();
    const first = await savePage(db.client(), { tenantId: T1, page: "ads", data: { campaigns: [{ name: "Fall" }] }, version: 0, by: "ads" }, now);
    expect(first).toMatchObject({ saved: { page: "ads", version: 1, updatedBy: "ads" } });
    const second = await savePage(db.client(), { tenantId: T1, page: "ads", data: { campaigns: [] }, version: 1, by: "ads" }, now);
    expect(second).toMatchObject({ saved: { version: 2 } });
    const stale = await savePage(db.client(), { tenantId: T1, page: "ads", data: { campaigns: [] }, version: 1, by: "ads" }, now);
    expect(stale).toMatchObject({ conflict: { version: 2 } });
  });

  it("refuses a page that is not an object", async () => {
    const res = await savePage(new FakeDb().client(), { tenantId: T1, page: "ads", data: "x", version: 0, by: "ads" }, now);
    expect(res).toMatchObject({ error: 400 });
  });
});

describe("agentSavePage", () => {
  it("writes the chat agent's own page, cleaned", async () => {
    const db = world("research");
    const res = await agentSavePage(db.client(), { messageId: M1, data: { zips: "bad", sourcesNote: "Census" }, version: 0 }, now);
    expect(res).toMatchObject({ tenantId: T1, saved: { page: "research", version: 1 } });
    if (!("saved" in res)) throw new Error("not saved");
    expect((res.saved.data as ResearchPage).zips).toEqual([]);
    expect((res.saved.data as ResearchPage).sourcesNote).toBe("Census");
  });

  it("an agent with no page is refused", async () => {
    const res = await agentSavePage(world("ghl").client(), { messageId: M1, data: {}, version: 0 }, now);
    expect(res).toMatchObject({ error: 403 });
  });
});
