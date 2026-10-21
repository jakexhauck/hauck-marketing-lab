import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { creativeTurn, fileGrantFor, readablePath, stalePreviews } from "./agentCreative";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const M1 = "aaaaaaaa-0000-4000-8000-000000000001";
const ITEM = "bbbbbbbb-0000-4000-8000-000000000001";
const FILE = `${T1}/cccccccc-0000-4000-8000-000000000001.mp4`;

function chat(id: string, tenant_id: string, agent = "ads") {
  return { id, tenant_id, agent, title: id, auto: false, claude_session_id: `s-${id}`, started: true };
}

function message(meta: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return { id: M1, chat_id: "c1", role: "me", body: "Approved: Ad 1", status: "running", meta, created_at: "2026-10-17T10:00:00Z", ...over };
}

function card(over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  return {
    id: ITEM,
    tenant_id: T1,
    agent: "ads",
    chat_id: "c1",
    kind: "creative",
    title: "Ad 1",
    status: "done",
    approved_at: "2026-10-17T09:59:00Z",
    updated_at: "2026-10-17T09:59:00Z",
    payload: { path: FILE, grant: { kind: "file" }, runnerOwned: true, ...payload },
    ...over,
  };
}

const fileGrant = { followUpOf: ITEM, grant: { itemId: ITEM, kind: "file", limit: null } };

function db(msg = message(fileGrant), item: Record<string, unknown> | null = card(), chats = [chat("c1", T1)]) {
  const d = new FakeDb().seed("agent_chats", chats).seed("agent_messages", [msg]);
  if (item) d.seed("agent_items", [item]);
  return d;
}

async function turnOf(d: FakeDb, tenant = T1) {
  const t = await creativeTurn(d.client(), M1, tenant);
  if ("error" in t) throw new Error(`refused: ${t.error}`);
  return t;
}

describe("creativeTurn", () => {
  it("accepts a running message in a Creative chat for that client", async () => {
    const t = await creativeTurn(db().client(), M1, T1);
    expect("error" in t).toBe(false);
  });

  it("refuses a message from another agent's chat (403)", async () => {
    const t = await creativeTurn(db(message(), null, [chat("c1", T1, "ghl")]).client(), M1, T1);
    expect(t).toMatchObject({ status: 403 });
  });

  it("refuses another client's tenant id (403)", async () => {
    expect(await creativeTurn(db().client(), M1, T2)).toMatchObject({ status: 403 });
  });

  it("refuses a message that is not running (409)", async () => {
    expect(await creativeTurn(db(message(fileGrant, { status: "done" })).client(), M1, T1)).toMatchObject({ status: 409 });
  });

  it("refuses ids that are not uuids (400)", async () => {
    expect(await creativeTurn(db().client(), "m1", T1)).toMatchObject({ status: 400 });
  });
});

describe("fileGrantFor", () => {
  it("allows the file on the approved card, on the turn carrying its grant", async () => {
    const d = db();
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toBeNull();
  });

  it("refuses without a file grant (409)", async () => {
    const d = db(message({ followUpOf: ITEM }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409, error: "no file grant on this message" });
  });

  it("refuses a spend grant used as a file grant (409)", async () => {
    const d = db(message({ grant: { itemId: ITEM, kind: "spend", limit: 10 } }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409 });
  });

  it("refuses a card Jake has not approved (409)", async () => {
    const d = db(message(fileGrant), card({ status: "needs_ok", approved_at: null }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409, error: "the card was not approved" });
  });

  it("refuses any path but the one on the card (409)", async () => {
    const d = db();
    const other = `${T1}/dddddddd-0000-4000-8000-000000000001.mp4`;
    expect(await fileGrantFor(d.client(), await turnOf(d), other)).toMatchObject({ status: 409 });
  });

  it("refuses a card from another agent or chat (403)", async () => {
    const d = db(message(fileGrant), card({ agent: "ghl" }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 403 });
    const e = db(message(fileGrant), card({ chat_id: "c2" }));
    expect(await fileGrantFor(e.client(), await turnOf(e), FILE)).toMatchObject({ status: 403 });
  });

  it("refuses a card that never asked to file (409)", async () => {
    const d = db(message(fileGrant), card({}, { grant: { kind: "spend" } }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409 });
  });

  it("refuses a file card the runner did not make (409)", async () => {
    const d = db(message(fileGrant), card({}, { runnerOwned: undefined }));
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409, error: "the runner did not make that card" });
  });

  it("files once: a replay is refused (409)", async () => {
    const d = db().seed("ad_creative_files", [{ id: "f1", tenant_id: T1, path: FILE }]);
    expect(await fileGrantFor(d.client(), await turnOf(d), FILE)).toMatchObject({ status: 409, error: "already filed" });
  });
});

describe("readablePath", () => {
  it("reads this client's previews and finals only", () => {
    expect(readablePath(`${T1}/previews/cccccccc-0000-4000-8000-000000000001.mp4`, T1)).toBe(true);
    expect(readablePath(FILE, T1)).toBe(true);
    expect(readablePath(`${T2}/previews/cccccccc-0000-4000-8000-000000000001.mp4`, T1)).toBe(false);
    expect(readablePath(`${T1}/previews/../x.mp4`, T1)).toBe(false);
    expect(readablePath(`${T1}/contracts/cccccccc-0000-4000-8000-000000000001.pdf`, T1)).toBe(false);
  });
});

describe("stalePreviews", () => {
  it("picks previews older than a week", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(
      stalePreviews(
        [
          { name: "old.mp4", created_at: "2026-10-09T12:00:00Z" },
          { name: "new.mp4", created_at: "2026-10-16T12:00:00Z" },
          { name: "unknown.mp4", created_at: null },
        ],
        now,
      ),
    ).toEqual(["old.mp4"]);
  });
});
