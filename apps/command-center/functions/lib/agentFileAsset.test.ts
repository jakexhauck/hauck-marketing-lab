import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { fileLandingAsset, liveUrlMatches } from "./agentFileAsset";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333333";
const I1 = "44444444-4444-4444-8444-444444444444";
const C1 = "55555555-5555-4555-8555-555555555555";
const PREVIEW = "https://d-44444444.hm-clear-choice.pages.dev";
const LIVE = "https://hm-clear-choice.pages.dev";

describe("liveUrlMatches", () => {
  it("is the preview's own project, one label up", () => {
    expect(liveUrlMatches(PREVIEW, LIVE)).toBe(true);
    expect(liveUrlMatches(PREVIEW, `${LIVE}/`)).toBe(true);
  });

  it("refuses any other address", () => {
    for (const bad of [
      "https://hm-other.pages.dev",
      "http://hm-clear-choice.pages.dev",
      "https://hm-clear-choice.pages.dev.evil.com",
      "https://evil.com/?https://hm-clear-choice.pages.dev",
      PREVIEW,
      "",
    ]) {
      expect(liveUrlMatches(PREVIEW, bad), bad).toBe(false);
    }
    expect(liveUrlMatches(undefined, LIVE)).toBe(false);
    expect(liveUrlMatches("https://evil.com", "https://com")).toBe(false);
  });
});

function world(over: { agent?: string; status?: string; grant?: unknown; itemStatus?: string; itemAgent?: string; itemTenant?: string; chatTenant?: string; role?: string } = {}) {
  return new FakeDb()
    .seed("agent_chats", [{ id: C1, tenant_id: over.chatTenant ?? T1, agent: over.agent ?? "landing", title: "Winter", auto: false }])
    .seed("agent_items", [
      {
        id: I1,
        tenant_id: over.itemTenant ?? T1,
        agent: over.itemAgent ?? "landing",
        chat_id: C1,
        kind: "landing_page",
        title: "Winter offer page",
        status: over.itemStatus ?? "done",
        payload: { site: "winter", previewUrl: PREVIEW, grant: { kind: "deploy" } },
        approved_at: "2026-10-17T11:00:00.000Z",
        updated_at: "2026-10-17T11:00:00.000Z",
      },
    ])
    .seed("agent_messages", [
      {
        id: M1,
        chat_id: C1,
        role: over.role ?? "me",
        body: "Approved: Winter offer page",
        status: over.status ?? "running",
        meta: { followUpOf: I1, grant: over.grant === undefined ? { itemId: I1, kind: "deploy", limit: null } : over.grant },
      },
    ]);
}

const body = { messageId: M1, tenantId: T1, title: "Winter offer page", liveUrl: LIVE };

describe("fileLandingAsset", () => {
  it("files the live page as a Conversion Asset and marks the card live", async () => {
    const db = world();
    const res = await fileLandingAsset(db.client(), body);
    expect("assetId" in res).toBe(true);
    const pages = db.rows("followup_pages");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ tenant_id: T1, external_url: LIVE, title: "Winter offer page", status: "live", asset_kind: "", slug: "" });
    expect(db.rows("agent_items")[0]).toMatchObject({ status: "live", payload: { liveUrl: LIVE, previewUrl: PREVIEW } });
  });

  it("files a re-run once", async () => {
    const db = world();
    const a = await fileLandingAsset(db.client(), body);
    const b = await fileLandingAsset(db.client(), body);
    expect(db.rows("followup_pages")).toHaveLength(1);
    expect("assetId" in a && "assetId" in b && a.assetId === b.assetId).toBe(true);
  });

  it("409 when the message carries no deploy grant", async () => {
    expect(await fileLandingAsset(world({ grant: null }).client(), body)).toMatchObject({ error: 409 });
    expect(await fileLandingAsset(world({ grant: { itemId: I1, kind: "spend", limit: 5 } }).client(), body)).toMatchObject({ error: 409 });
    expect(await fileLandingAsset(world({ grant: { itemId: "nope", kind: "deploy" } }).client(), body)).toMatchObject({ error: 409 });
  });

  it("409 when the message is not running", async () => {
    for (const status of ["queued", "done", "error"]) {
      expect(await fileLandingAsset(world({ status }).client(), body), status).toMatchObject({ error: 409 });
    }
  });

  it("409 when the card was never approved", async () => {
    for (const itemStatus of ["building", "needs_ok", "declined"]) {
      expect(await fileLandingAsset(world({ itemStatus }).client(), body), itemStatus).toMatchObject({ error: 409 });
    }
  });

  it("403 for a message from another agent's chat", async () => {
    const db = world({ agent: "creative" });
    expect(await fileLandingAsset(db.client(), body)).toMatchObject({ error: 403 });
    expect(db.rows("followup_pages")).toHaveLength(0);
  });

  it("403 for another client", async () => {
    expect(await fileLandingAsset(world().client(), { ...body, tenantId: T2 })).toMatchObject({ error: 403 });
    expect(await fileLandingAsset(world({ itemTenant: T2 }).client(), body)).toMatchObject({ error: 403 });
    expect(await fileLandingAsset(world({ itemAgent: "ads" }).client(), body)).toMatchObject({ error: 403 });
  });

  it("400 for a live URL that is not the approved preview's project", async () => {
    const db = world();
    expect(await fileLandingAsset(db.client(), { ...body, liveUrl: "https://hm-other.pages.dev" })).toMatchObject({ error: 400 });
    expect(db.rows("followup_pages")).toHaveLength(0);
    expect(db.rows("agent_items")[0].status).toBe("done");
  });

  it("400 for a bad body and 404 for an unknown message", async () => {
    expect(await fileLandingAsset(world().client(), { ...body, messageId: "x" })).toMatchObject({ error: 400 });
    expect(await fileLandingAsset(world().client(), { ...body, tenantId: "agency" })).toMatchObject({ error: 400 });
    expect(await fileLandingAsset(world().client(), { ...body, messageId: I1 })).toMatchObject({ error: 404 });
    expect(await fileLandingAsset(world({ role: "ai" }).client(), body)).toMatchObject({ error: 404 });
  });
});
