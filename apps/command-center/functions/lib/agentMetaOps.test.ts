import { afterEach, describe, expect, it, vi } from "vitest";
import endpointSource from "../api/agent-runner/meta-ops.ts?raw";
import libSource from "./agentMetaOps.ts?raw";
import { FakeDb } from "./agentFakeDb";
import {
  BUDGET_CARD_MAX_INCREASE_CENTS,
  BUDGET_MAX_CENTS,
  BUDGET_MAX_FACTOR,
  META_OPS,
  budgetGuard,
  callMetaOp,
  isMetaWriteOp,
  metaOpOnCard,
  metaWriteAllowed,
  parseMetaOpArgs,
  type MetaCallDeps,
  type MetaCallerChat,
  type MetaGrantItem,
} from "./agentMetaOps";
import type { AgentMessage } from "../../src/lib/agentWire";
import { itemPayload } from "../../src/lib/agentView";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const MSG = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";
const FILE = "66666666-6666-4666-8666-666666666666";
const FILE2 = "77777777-7777-4777-8777-777777777777";

function msg(over: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: MSG,
    chatId: "c1",
    role: "me",
    body: "Pause Winter 2",
    status: "running",
    tools: [],
    used: [],
    learned: [],
    itemId: null,
    fromAgent: null,
    followUpOf: null,
    answerOf: null,
    grant: null,
    error: null,
    createdAt: "2026-10-17T09:00:00.000Z",
    ...over,
  };
}

const chat = (over: Partial<MetaCallerChat> = {}): MetaCallerChat => ({ agent: "ads", tenantId: T1, auto: false, ...over });
const approved = (over: Partial<MetaGrantItem> = {}): MetaGrantItem => ({
  id: ITEM,
  agent: "ads",
  tenantId: T1,
  approvedAt: "2026-10-17T09:30:00.000Z",
  ...over,
});
const grant = { itemId: ITEM, kind: "meta" as const, limit: null };

describe("metaWriteAllowed", () => {
  it("never lets a Director trigger change Meta, even on an Acts live task", () => {
    expect(metaWriteAllowed(msg({ role: "trigger", live: true }), chat(), approved())).toBe(false);
    expect(metaWriteAllowed(msg({ role: "trigger", live: true, followUpOf: ITEM, grant }), chat(), approved())).toBe(false);
  });

  it("never allows a typed ask on its own, not even Jake's", () => {
    expect(metaWriteAllowed(msg(), chat())).toBe(false);
    expect(metaWriteAllowed(msg(), chat(), approved())).toBe(false);
  });

  it("allows an approved meta grant on the Ads Agent's own card", () => {
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved())).toBe(true);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat({ auto: true }), approved())).toBe(true);
  });

  it("refuses a grant of another kind, or one the card does not back up", () => {
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant: { ...grant, kind: "ghl" } }), chat(), approved())).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat())).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ approvedAt: null }))).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ agent: "ghl" }))).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ tenantId: T2 }))).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ id: "other" }))).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: "other", grant }), chat(), approved())).toBe(false);
  });

  it("is the Ads Agent only, on a running message of Jake's", () => {
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat({ agent: "ghl" }), approved({ agent: "ghl" }))).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant }), chat({ agent: "manager" }), approved())).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant, status: "done" }), chat(), approved())).toBe(false);
    expect(metaWriteAllowed(msg({ followUpOf: ITEM, grant, role: "request" }), chat(), approved())).toBe(false);
  });
});

describe("META_OPS", () => {
  it("is exactly the planned allowlist: four reads, four writes, no deletes", () => {
    expect(Object.keys(META_OPS).sort()).toEqual(["createAd", "dailyBudget", "pause", "read.creatives", "read.destination", "read.library", "read.structure", "resume"]);
    for (const op of Object.keys(META_OPS)) expect(isMetaWriteOp(op), op).toBe(!op.startsWith("read."));
  });

  it("checks args before anything is sent", () => {
    expect(parseMetaOpArgs("pause", { level: "ad", id: "120", name: "Winter 2", adsetName: "Willis Winter", campaignName: "Fall" })).toEqual({
      ok: true,
      args: { level: "ad", id: "120", name: "Winter 2", adsetName: "Willis Winter", campaignName: "Fall" },
    });
    // The parent path is part of the change: an ad names its ad set and
    // campaign, an ad set its campaign.
    expect(parseMetaOpArgs("pause", { level: "ad", id: "120", name: "Winter 2", campaignName: "Fall" }).ok).toBe(false);
    expect(parseMetaOpArgs("pause", { level: "adset", id: "9", name: "Willis Winter" }).ok).toBe(false);
    expect(parseMetaOpArgs("pause", { level: "adset", id: "9", name: "Willis Winter", campaignName: "Fall" }).ok).toBe(true);
    expect(parseMetaOpArgs("pause", { level: "campaign", id: "1", name: "Fall" })).toEqual({ ok: true, args: { level: "campaign", id: "1", name: "Fall" } });
    expect(parseMetaOpArgs("pause", { level: "account", id: "120", name: "x" }).ok).toBe(false);
    expect(parseMetaOpArgs("pause", { level: "ad", id: "../me", name: "x" }).ok).toBe(false);
    expect(parseMetaOpArgs("pause", { level: "ad", id: "120" }).ok).toBe(false);
    expect(parseMetaOpArgs("dailyBudget", { level: "adset", id: "9", name: "x", campaignName: "Fall", from: 4000, to: 5000 }).ok).toBe(true);
    expect(parseMetaOpArgs("dailyBudget", { level: "adset", id: "9", name: "x", from: 4000, to: 5000 }).ok).toBe(false);
    expect(parseMetaOpArgs("dailyBudget", { level: "ad", id: "9", name: "x", from: 4000, to: 5000 }).ok).toBe(false);
    expect(parseMetaOpArgs("dailyBudget", { level: "adset", id: "9", name: "x", from: 4000, to: 50.5 }).ok).toBe(false);
    expect(parseMetaOpArgs("dailyBudget", { level: "adset", id: "9", name: "x", from: 4000, to: 4000 }).ok).toBe(false);
    expect(parseMetaOpArgs("dailyBudget", { level: "adset", id: "9", name: "x", to: 5000 }).ok).toBe(false);
    const ad = {
      adsetId: "9", adsetName: "Willis Winter", campaignName: "Fall", fileId: FILE, fileName: "winter-3.mp4",
      name: "Winter 3", message: "Free estimate", cta: "SIGN_UP", leadFormId: "555",
    };
    expect(parseMetaOpArgs("createAd", ad)).toEqual({
      ok: true,
      args: { ...ad, headline: null, description: null, link: null, status: "PAUSED" },
    });
    // The destination is on the card: a button, and a link or a lead form.
    expect(parseMetaOpArgs("createAd", { ...ad, cta: undefined }).ok).toBe(false);
    expect(parseMetaOpArgs("createAd", { ...ad, leadFormId: undefined }).ok).toBe(false);
    expect(parseMetaOpArgs("createAd", { ...ad, leadFormId: undefined, link: "https://x.example" }).ok).toBe(true);
    expect(parseMetaOpArgs("createAd", { ...ad, status: "ACTIVE" })).toMatchObject({ ok: true, args: { status: "ACTIVE" } });
    expect(parseMetaOpArgs("createAd", { ...ad, status: "DELETED" }).ok).toBe(false);
    expect(parseMetaOpArgs("createAd", { ...ad, fileId: "x" }).ok).toBe(false);
    expect(parseMetaOpArgs("createAd", { ...ad, message: "" }).ok).toBe(false);
    // A video comes from the ad account's library, never through the Worker.
    const { fileId: _f, fileName: _n, ...noFile } = ad;
    expect(parseMetaOpArgs("createAd", { ...noFile, videoId: "777", videoName: "winter-3 4:5.mp4" })).toMatchObject({
      ok: true,
      args: { videoId: "777", videoName: "winter-3 4:5.mp4" },
    });
    expect(parseMetaOpArgs("createAd", { ...ad, videoId: "777", videoName: "v" }).ok).toBe(false);
    expect(parseMetaOpArgs("createAd", noFile).ok).toBe(false);
    const { campaignName: _c, ...noCampaign } = ad;
    expect(parseMetaOpArgs("createAd", noCampaign).ok).toBe(false);
    expect(parseMetaOpArgs("delete", {}).ok).toBe(false);
  });

  it("holds a budget change to 3x and $500/day", () => {
    expect(BUDGET_MAX_FACTOR).toBe(3);
    expect(BUDGET_MAX_CENTS).toBe(50000);
    const b = (from: number, to: number, code = "USD") => budgetGuard(from, to, code) === null;
    expect(b(4000, 12000)).toBe(true);
    expect(b(4000, 12001)).toBe(false);
    expect(b(20000, 50000)).toBe(true);
    expect(b(20000, 50001)).toBe(false);
    // Lowering is always fine.
    expect(b(60000, 1000)).toBe(true);
    // In a currency Meta counts without decimals, 500 is the 500 units.
    expect(b(200, 500, "JPY")).toBe(true);
    expect(b(200, 501, "JPY")).toBe(false);
    expect(budgetGuard(20000, 50001, "EUR")).toMatch(/500\.00 EUR/);
  });

  it("matches a card op by its parsed args, so a different id or name is not on the card", () => {
    const p = { level: "ad", id: "120", name: "Winter 2", adsetName: "Willis Winter", campaignName: "Fall" };
    const ops = [{ op: "pause", args: p }];
    expect(metaOpOnCard(ops, "pause", p)).toBe(true);
    expect(metaOpOnCard(ops, "pause", { ...p, id: "121" })).toBe(false);
    expect(metaOpOnCard(ops, "resume", p)).toBe(false);
    expect(metaOpOnCard(undefined, "pause", p)).toBe(false);
  });
});

// ---- the endpoint's core, against a fake DB and a fake Graph --------------

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, string>;
  // How many audit rows existed when this call went out.
  auditRows: number;
}

type Route = unknown | ((c: Call) => unknown);

let db: FakeDb;

function fakeGraph(routes: Record<string, Route>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body: Record<string, string> = {};
      if (init.body instanceof URLSearchParams) for (const [k, v] of init.body) body[k] = v;
      else if (typeof init.body === "string") for (const [k, v] of new URLSearchParams(init.body)) body[k] = v;
      else if (init.body instanceof FormData) for (const [k, v] of init.body) body[k] = typeof v === "string" ? v : "(blob)";
      const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
      const call: Call = { method, path, query: u.searchParams, body, auditRows: db ? db.rows("admin_audit_log").length : 0 };
      calls.push(call);
      const key = `${method} ${path}`;
      if (key === "GET /act_100" && !(key in routes)) return new Response(JSON.stringify({ id: "act_100", currency: "USD" }), { status: 200 });
      if (!(key in routes)) return new Response(JSON.stringify({ error: { message: `no route ${key}` } }), { status: 404 });
      const r = routes[key];
      return new Response(JSON.stringify(typeof r === "function" ? (r as (c: Call) => unknown)(call) : r), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const PERMS = { data: [{ permission: "ads_management", status: "granted" }, { permission: "ads_read", status: "granted" }] };

function world(
  over: {
    message?: Record<string, unknown>;
    chat?: Record<string, unknown>;
    ops?: unknown;
    tenant?: Record<string, unknown>;
    noAdmin?: boolean;
  } = {},
) {
  db = new FakeDb()
    .seed("tenants", [
      { id: T1, meta_ad_account_id: "act_100", meta_page_id: "PAGE1", ...over.tenant },
      { id: T2, meta_ad_account_id: "act_200", meta_page_id: "PAGE2" },
    ])
    .seed("agent_chats", [{ id: "c1", tenant_id: T1, agent: "ads", auto: false, user_id: ADMIN, ...over.chat }])
    .seed("agent_messages", [
      {
        id: MSG,
        chat_id: "c1",
        role: "me",
        body: "Approved: Pause Winter 2",
        status: "running",
        meta: { followUpOf: ITEM, grant: { itemId: ITEM, kind: "meta", limit: null } },
        ...over.message,
      },
    ])
    .seed("agent_items", [
      {
        id: ITEM,
        tenant_id: T1,
        agent: "ads",
        status: "done",
        title: "Pause Winter 2",
        approved_at: "2026-10-17T09:30:00.000Z",
        payload: { grant: { kind: "meta" }, ops: over.ops ?? [] },
      },
    ])
    .seed("admin_accounts", over.noAdmin ? [] : [{ id: ADMIN, role: "owner", status: "active" }])
    .seed("ad_creative_files", [
      { id: FILE, tenant_id: T1, path: `${T1}/f1.jpg`, name: "winter-3.jpg", kind: "image", mime_type: "image/jpeg", size_bytes: 1000 },
      { id: FILE2, tenant_id: T2, path: `${T2}/f2.jpg`, name: "other.jpg", kind: "image", mime_type: "image/jpeg", size_bytes: 1000 },
    ]);
  return db;
}

const deps: MetaCallDeps = {
  token: async () => "SYS",
  download: async () => new Blob([new Uint8Array(1000)], { type: "image/jpeg" }),
};

const PAUSE = { level: "ad", id: "120", name: "Winter 2", adsetName: "Willis Winter", campaignName: "Fall" };
const AD_120 = {
  id: "120",
  account_id: "100",
  name: "Winter 2",
  status: "ACTIVE",
  adset_id: "9",
  adset: { id: "9", name: "Willis Winter" },
  campaign: { id: "1", name: "Fall" },
};

describe("callMetaOp", () => {
  it("answers 400 for an unknown op and never calls Meta", async () => {
    const calls = fakeGraph({});
    const res = await callMetaOp(world().client(), { messageId: MSG, tenantId: T1, op: "deleteCampaign", args: {} }, deps);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("reads the account's campaigns, ad sets and ads for the ads chat's own client", async () => {
    const calls = fakeGraph({
      "GET /act_100/campaigns": { data: [{ id: "1", name: "Fall", status: "ACTIVE", daily_budget: "4000" }] },
      "GET /act_100/adsets": { data: [{ id: "9", name: "Willis Winter", campaign_id: "1" }] },
      "GET /act_100/ads": { data: [AD_120] },
    });
    const res = await callMetaOp(world({ message: { meta: {} } }).client(), { messageId: MSG, tenantId: T1, op: "read.structure" }, deps);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ campaigns: [{ name: "Fall" }], adsets: [{ name: "Willis Winter" }], ads: [{ name: "Winter 2" }] });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("lets a Director trigger read Meta and never change it, even acting live", async () => {
    fakeGraph({
      "GET /act_100/campaigns": { data: [] },
      "GET /act_100/adsets": { data: [] },
      "GET /act_100/ads": { data: [] },
    });
    const trigger = { role: "trigger", meta: { live: true, followUpOf: ITEM, grant: { itemId: ITEM, kind: "meta", limit: null } } };
    const read = await callMetaOp(world({ message: trigger }).client(), { messageId: MSG, tenantId: T1, op: "read.structure" }, deps);
    expect(read.status).toBe(200);
    const calls = fakeGraph({ [`GET /120`]: AD_120 });
    const res = await callMetaOp(world({ message: trigger, ops: [{ op: "pause", args: PAUSE }] }).client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("lists only this client's Creatives files", async () => {
    fakeGraph({});
    const res = await callMetaOp(world().client(), { messageId: MSG, tenantId: T1, op: "read.creatives" }, deps);
    expect(res.status).toBe(200);
    const rows = res.body.result as { id: string; name: string }[];
    expect(rows.map((r) => r.name)).toEqual(["winter-3.jpg"]);
    expect(JSON.stringify(rows)).not.toContain("path");
  });

  it("refuses another client's tenant, another agent's chat and a finished message", async () => {
    fakeGraph({ "GET /act_100/campaigns": { data: [] }, "GET /act_100/adsets": { data: [] }, "GET /act_100/ads": { data: [] } });
    const body = { messageId: MSG, op: "read.structure" };
    expect((await callMetaOp(world().client(), { ...body, tenantId: T2 }, deps)).status).toBe(403);
    expect((await callMetaOp(world({ chat: { agent: "reporting" } }).client(), { ...body, tenantId: T1 }, deps)).status).toBe(403);
    expect((await callMetaOp(world({ chat: { agent: "ghl" } }).client(), { ...body, tenantId: T1 }, deps)).status).toBe(403);
    expect((await callMetaOp(world({ message: { status: "done" } }).client(), { ...body, tenantId: T1 }, deps)).status).toBe(403);
  });

  it("refuses a write on a typed ask, with no card, and sends and logs nothing", async () => {
    const w = world({ message: { meta: {}, body: "Pause Winter 2 now" } });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": AD_120, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
    expect(w.rows("admin_audit_log")).toEqual([]);
  });

  it("pauses an ad on the approved card, logging agent:meta.pause before it sends", async () => {
    const w = world({ ops: [{ op: "pause", args: PAUSE }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": AD_120, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ action: "paused", level: "ad", id: "120", name: "Winter 2", before: "ACTIVE" });
    const post = calls.filter((c) => c.method === "POST");
    expect(post).toHaveLength(1);
    expect(post[0].body).toMatchObject({ status: "PAUSED", access_token: "SYS" });
    expect(post[0].auditRows).toBe(1);
    const log = w.rows("admin_audit_log");
    expect(log[0]).toMatchObject({ admin_id: ADMIN, action: "agent:meta.pause", target_tenant_id: T1 });
    expect(log[0].payload).toMatchObject({ messageId: MSG, itemId: ITEM, args: PAUSE });
  });

  it("resumes with status ACTIVE", async () => {
    const w = world({ ops: [{ op: "resume", args: PAUSE }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": { ...AD_120, status: "PAUSED" }, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "resume", args: PAUSE }, deps);
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "POST")?.body.status).toBe("ACTIVE");
  });

  it("refuses an op or args that are not on the approved card", async () => {
    for (const [ops, op, args] of [
      [[{ op: "pause", args: PAUSE }], "pause", { ...PAUSE, id: "121" }],
      [[{ op: "pause", args: PAUSE }], "resume", PAUSE],
      [[{ op: "pause", args: PAUSE }], "dailyBudget", { level: "campaign", id: "1", name: "Fall", from: 4000, to: 5000 }],
      [undefined, "pause", PAUSE],
      ["nope", "pause", PAUSE],
    ] as const) {
      const w = world({ ops });
      const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": AD_120, "POST /120": { success: true } });
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op, args }, deps);
      expect(res.status, op).toBe(403);
      expect(calls).toEqual([]);
      expect(w.rows("admin_audit_log")).toEqual([]);
    }
  });

  it("refuses an object in another client's ad account", async () => {
    const w = world({ ops: [{ op: "pause", args: PAUSE }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": { ...AD_120, account_id: "200" }, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(w.rows("admin_audit_log")).toEqual([]);
  });

  it("refuses when the card's name is not the live name", async () => {
    const w = world({ ops: [{ op: "pause", args: PAUSE }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": { ...AD_120, name: "Spring 1" }, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses when the ad's ad set or campaign is not the one on the card (same name, other place)", async () => {
    for (const live of [
      { ...AD_120, adset: { id: "8", name: "Willis Spring" } },
      { ...AD_120, campaign: { id: "2", name: "Spring" } },
    ]) {
      const w = world({ ops: [{ op: "pause", args: PAUSE }] });
      const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": live, "POST /120": { success: true } });
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
      expect(res.status).toBe(409);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
      expect(w.rows("admin_audit_log")).toEqual([]);
    }
  });

  it("refuses when the token lacks ads_management", async () => {
    const w = world({ ops: [{ op: "pause", args: PAUSE }] });
    const calls = fakeGraph({
      "GET /me/permissions": { data: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "declined" }] },
      "GET /120": AD_120,
      "POST /120": { success: true },
    });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(503);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses the write when the audit row cannot be saved", async () => {
    const w = world({ ops: [{ op: "pause", args: PAUSE }], chat: { user_id: null }, noAdmin: true });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /120": AD_120, "POST /120": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "pause", args: PAUSE }, deps);
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  const BUDGET = { level: "campaign", id: "1", name: "Fall", from: 4000, to: 5000 };
  const CAMP_1 = { id: "1", account_id: "100", name: "Fall", status: "ACTIVE", daily_budget: "4000" };

  it("changes a daily budget when the live one is still the card's from", async () => {
    const w = world({ ops: [{ op: "dailyBudget", args: BUDGET }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /1": CAMP_1, "POST /1": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: BUDGET }, deps);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ action: "budget", from: 4000, to: 5000 });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ daily_budget: "5000" });
    expect(w.rows("admin_audit_log")[0].action).toBe("agent:meta.dailyBudget");
  });

  it("refuses a stale card: the live budget moved since Jake saw it", async () => {
    const w = world({ ops: [{ op: "dailyBudget", args: BUDGET }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /1": { ...CAMP_1, daily_budget: "4500" }, "POST /1": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: BUDGET }, deps);
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/45\.00/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(w.rows("admin_audit_log")).toEqual([]);
  });

  it("refuses a budget that does not live at that level (campaign budget or lifetime)", async () => {
    const w = world({ ops: [{ op: "dailyBudget", args: BUDGET }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /1": { ...CAMP_1, daily_budget: undefined, lifetime_budget: "90000" }, "POST /1": {} });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: BUDGET }, deps);
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses a budget past the guard even on an approved card", async () => {
    const big = { ...BUDGET, to: 12001 };
    const w = world({ ops: [{ op: "dailyBudget", args: big }] });
    const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /1": CAMP_1, "POST /1": { success: true } });
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: big }, deps);
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(w.rows("admin_audit_log")).toEqual([]);
  });

  it("reads the account currency once, and outside USD needs the card to state it", async () => {
    const jpy = { ...BUDGET, from: 4000, to: 5000 };
    // No currency on the card for a yen account: refused.
    let w = world({ ops: [{ op: "dailyBudget", args: jpy }] });
    let calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /act_100": { currency: "JPY" }, "GET /1": CAMP_1, "POST /1": { success: true } });
    let res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: jpy }, deps);
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/JPY/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    // The wrong currency on the card: refused.
    const eur = { ...jpy, currency: "EUR" };
    w = world({ ops: [{ op: "dailyBudget", args: eur }] });
    calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /act_100": { currency: "JPY" }, "GET /1": CAMP_1, "POST /1": { success: true } });
    res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: eur }, deps);
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    // Stated, but over 500 yen a day: the guard is in yen.
    const stated = { ...BUDGET, from: 300, to: 600, currency: "JPY" };
    w = world({ ops: [{ op: "dailyBudget", args: stated }] });
    calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /act_100": { currency: "JPY" }, "GET /1": { ...CAMP_1, daily_budget: "300" }, "POST /1": { success: true } });
    res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: stated }, deps);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/500 JPY/);
    expect(calls.filter((c) => c.path === "/act_100")).toHaveLength(1);

    // Stated and inside the guard: goes through.
    const small = { ...BUDGET, from: 200, to: 400, currency: "JPY" };
    w = world({ ops: [{ op: "dailyBudget", args: small }] });
    calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /act_100": { currency: "JPY" }, "GET /1": { ...CAMP_1, daily_budget: "200" }, "POST /1": { success: true } });
    res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: small }, deps);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(calls.find((c) => c.method === "POST")?.body.daily_budget).toBe("400");
  });

  it("refuses a card that chains two budget changes on one object", async () => {
    const step1 = { ...BUDGET, from: 4000, to: 12000 };
    const step2 = { ...BUDGET, from: 12000, to: 36000 };
    for (const [args, live] of [
      [step1, "4000"],
      [step2, "12000"],
    ] as const) {
      const w = world({ ops: [{ op: "dailyBudget", args: step1 }, { op: "dailyBudget", args: step2 }] });
      const calls = fakeGraph({ "GET /me/permissions": PERMS, "GET /1": { ...CAMP_1, daily_budget: live }, "POST /1": { success: true } });
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args }, deps);
      expect(res.status).toBe(409);
      expect(String(res.body.error)).toMatch(/one budget change per/);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
      expect(w.rows("admin_audit_log")).toEqual([]);
    }
  });

  it("caps a card's total daily increase across every budget op", async () => {
    expect(BUDGET_CARD_MAX_INCREASE_CENTS).toBe(50000);
    const sets = Array.from({ length: 10 }, (_, i) => ({
      level: "adset",
      id: String(900 + i),
      name: `Set ${i}`,
      campaignName: "Fall",
      from: 4000,
      to: 10000,
    }));
    const ops = sets.map((args) => ({ op: "dailyBudget", args }));
    const routes: Record<string, unknown> = { "GET /me/permissions": PERMS };
    for (const s of sets) {
      routes[`GET /${s.id}`] = { id: s.id, account_id: "100", name: s.name, daily_budget: "4000", campaign: { name: "Fall" } };
      routes[`POST /${s.id}`] = { success: true };
    }
    // Ten times $60/day more is $600/day, over the card's $500.
    for (const args of [sets[0], sets[9]]) {
      const w = world({ ops });
      const calls = fakeGraph(routes);
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args }, deps);
      expect(res.status).toBe(409);
      expect(String(res.body.error)).toMatch(/\$500\.00/);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    }
    // Eight of them, $480/day more in all, go through; cuts do not count.
    const cut = { level: "adset", id: "990", name: "Cut", campaignName: "Fall", from: 40000, to: 1000 };
    const w = world({ ops: [...ops.slice(0, 8), { op: "dailyBudget", args: cut }] });
    fakeGraph(routes);
    const ok = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "dailyBudget", args: sets[0] }, deps);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  // ---- createAd -------------------------------------------------------

  const AD = {
    adsetId: "9", adsetName: "Willis Winter", campaignName: "Fall", fileId: FILE, fileName: "winter-3.jpg", name: "Winter 3",
    message: "Free estimate this week", cta: "SIGN_UP", link: "http://fb.me/", leadFormId: "FORM1",
  };
  const ADSET_9 = { id: "9", account_id: "100", name: "Willis Winter", campaign_id: "1", campaign: { id: "1", name: "Fall" } };
  const LEAD_SPEC = {
    page_id: "PAGE1",
    instagram_user_id: "IG1",
    link_data: { link: "http://fb.me/", image_hash: "old", call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "FORM1" } } },
  };
  const ADS_IN_9 = { data: [{ id: "120", name: "Winter 2", creative: { id: "cr1", object_story_spec: LEAD_SPEC } }] };

  function adRoutes(extra: Record<string, Route> = {}): Record<string, Route> {
    return {
      "GET /me/permissions": PERMS,
      "GET /9": ADSET_9,
      "GET /9/ads": ADS_IN_9,
      "POST /act_100/adimages": { images: { "winter-3.jpg": { hash: "HASH1" } } },
      "POST /act_100/adcreatives": { id: "CR2" },
      "POST /act_100/ads": { id: "AD2" },
      ...extra,
    };
  }

  it("creates a paused image ad in the ad set, with the Page and lead form its ads already use", async () => {
    const w = world({ ops: [{ op: "createAd", args: AD }] });
    const calls = fakeGraph(adRoutes());
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.result).toMatchObject({ action: "created", adId: "AD2", creativeId: "CR2", status: "PAUSED" });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.path)).toEqual(["/act_100/adimages", "/act_100/adcreatives", "/act_100/ads"]);
    expect(posts.every((c) => c.auditRows === 1)).toBe(true);
    const spec = JSON.parse(posts[1].body.object_story_spec);
    expect(spec).toEqual({
      page_id: "PAGE1",
      instagram_user_id: "IG1",
      link_data: {
        image_hash: "HASH1",
        link: "http://fb.me/",
        message: "Free estimate this week",
        call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "FORM1" } },
      },
    });
    expect(posts[2].body).toMatchObject({ name: "Winter 3", adset_id: "9", status: "PAUSED" });
    expect(JSON.parse(posts[2].body.creative)).toEqual({ creative_id: "CR2" });
    expect(w.rows("admin_audit_log")[0].action).toBe("agent:meta.createAd");
  });

  const { fileId: _fid, fileName: _fname, ...AD_NO_FILE } = AD;
  const VID = { ...AD_NO_FILE, videoId: "777", videoName: "winter-3 4:5.mp4", status: "ACTIVE" };
  const LIBRARY = { data: [{ id: "777", title: "winter-3 4:5.mp4", status: { video_status: "ready" } }] };

  it("creates a video ad from a video already in the ad account library, with its thumbnail", async () => {
    const w = world({ ops: [{ op: "createAd", args: VID }] });
    const calls = fakeGraph(
      adRoutes({
        "GET /act_100/advideos": LIBRARY,
        "GET /777/thumbnails": { data: [{ uri: "https://thumb/a.jpg", is_preferred: false }, { uri: "https://thumb/b.jpg", is_preferred: true }] },
      }),
    );
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: VID }, deps);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // Nothing is uploaded: the video is already Meta's.
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/act_100/adcreatives", "/act_100/ads"]);
    const lib = calls.find((c) => c.path === "/act_100/advideos")!;
    expect(lib.query.get("limit")).toBe("200");
    const spec = JSON.parse(calls.find((c) => c.path === "/act_100/adcreatives")!.body.object_story_spec);
    expect(spec.video_data).toEqual({
      video_id: "777",
      image_url: "https://thumb/b.jpg",
      message: "Free estimate this week",
      call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "FORM1", link: "http://fb.me/" } },
    });
    expect(calls.find((c) => c.path === "/act_100/ads")?.body.status).toBe("ACTIVE");
  });

  it("refuses a video that is not in the library yet, is still processing, or is named differently", async () => {
    for (const lib of [
      { data: [] },
      { data: [{ id: "777", title: "winter-3 4:5.mp4", status: { video_status: "processing" } }] },
      { data: [{ id: "777", title: "spring 4:5.mp4", status: { video_status: "ready" } }] },
    ]) {
      const w = world({ ops: [{ op: "createAd", args: VID }] });
      const calls = fakeGraph(adRoutes({ "GET /act_100/advideos": lib }));
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: VID }, deps);
      expect(res.status).toBe(409);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    }
    const w = world({ ops: [{ op: "createAd", args: VID }] });
    fakeGraph(adRoutes({ "GET /act_100/advideos": { data: [] } }));
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: VID }, deps);
    expect(String(res.body.error)).toMatch(/send it to Meta from Creatives first/);
  });

  it("will not carry a Creatives video through the Worker", async () => {
    const vid = { ...AD, fileName: "winter-3.mp4" };
    const w = world({ ops: [{ op: "createAd", args: vid }] });
    w.rows("ad_creative_files")[0].name = "winter-3.mp4";
    w.rows("ad_creative_files")[0].kind = "video";
    const calls = fakeGraph(adRoutes());
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: vid }, deps);
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/send it to Meta from Creatives first/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("lists the library's videos, one page", async () => {
    const calls = fakeGraph({ "GET /act_100/advideos": LIBRARY });
    const res = await callMetaOp(world().client(), { messageId: MSG, tenantId: T1, op: "read.library" }, deps);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual([{ id: "777", name: "winter-3 4:5.mp4", ready: true }]);
    expect(calls).toHaveLength(1);
  });

  it("refuses a Creatives file that is another client's, or not the card's file", async () => {
    for (const args of [
      { ...AD, fileId: FILE2, fileName: "other.jpg" },
      { ...AD, fileName: "winter-4.jpg" },
    ]) {
      const w = world({ ops: [{ op: "createAd", args }] });
      const calls = fakeGraph(adRoutes());
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args }, deps);
      expect([403, 409]).toContain(res.status);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
      expect(w.rows("admin_audit_log")).toEqual([]);
    }
  });

  it("refuses an ad set in another account, and an ad name the ad set already has", async () => {
    let w = world({ ops: [{ op: "createAd", args: AD }] });
    let calls = fakeGraph(adRoutes({ "GET /9": { ...ADSET_9, account_id: "200" } }));
    expect((await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps)).status).toBe(403);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    // The ad set moved to another campaign since the card was made.
    w = world({ ops: [{ op: "createAd", args: AD }] });
    calls = fakeGraph(adRoutes({ "GET /9": { ...ADSET_9, campaign: { id: "2", name: "Spring" } } }));
    expect((await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps)).status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    const dupe = { ...AD, name: "Winter 2" };
    w = world({ ops: [{ op: "createAd", args: dupe }] });
    calls = fakeGraph(adRoutes());
    expect((await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: dupe }, deps)).status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses when the ad set's ads go to different places, or nowhere it can copy", async () => {
    const other = { ...LEAD_SPEC, link_data: { ...LEAD_SPEC.link_data, call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "FORM2" } } } };
    for (const ads of [
      { data: [...ADS_IN_9.data, { id: "121", name: "Winter 1", creative: { id: "cr0", object_story_spec: other } }] },
      { data: [{ id: "120", name: "Winter 2", creative: { id: "cr1" } }] },
      { data: [] },
    ]) {
      const w = world({ ops: [{ op: "createAd", args: AD }] });
      const calls = fakeGraph(adRoutes({ "GET /9/ads": ads }));
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps);
      expect(res.status).toBe(409);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    }
  });

  // Every word Meta publishes for the ad must be on the card Jake approves.
  function leaves(v: unknown, skip: Set<string>, out: string[] = [], key = ""): string[] {
    if (typeof v === "string") {
      if (!skip.has(key)) out.push(v);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) leaves(x, skip, out, k);
    }
    return out;
  }
  const NOT_COPY = new Set(["page_id", "instagram_user_id", "image_hash", "video_id", "image_url"]);

  it("puts every published field of a new ad on the card, image and video", async () => {
    const full = { ...AD, headline: "Free quote", description: "This week only" };
    const vid = { ...AD_NO_FILE, headline: "Free quote", description: "This week only", videoId: "777", videoName: "winter-3 4:5.mp4" };
    for (const args of [full, vid]) {
      const w = world({ ops: [{ op: "createAd", args }] });
      const calls = fakeGraph(
        adRoutes({
          "GET /act_100/advideos": LIBRARY,
          "GET /777/thumbnails": { data: [{ uri: "https://thumb/b.jpg", is_preferred: true }] },
        }),
      );
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args }, deps);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const spec = JSON.parse(calls.find((c) => c.path === "/act_100/adcreatives")!.body.object_story_spec);
      const published = [...leaves(spec, NOT_COPY), calls.find((c) => c.path === "/act_100/ads")!.body.status];
      expect(published).toEqual(expect.arrayContaining(["Free quote", "This week only", "Free estimate this week", "SIGN_UP", "FORM1", "http://fb.me/"]));
      const card = itemPayload(w.rows("agent_items")[0].payload as Record<string, unknown>).changes;
      const shown = card.map((c) => `${c.text}${c.bold ?? ""}`).join("\n");
      for (const f of published) expect(shown, f).toContain(f);
      expect(card.find((c) => c.bold)?.bold).toBe("PAUSED");
    }
  });

  it("refuses when the ad set's ads no longer go where the card says", async () => {
    for (const args of [{ ...AD, leadFormId: "FORM9" }, { ...AD, cta: "LEARN_MORE" }, { ...AD, link: null }]) {
      const w = world({ ops: [{ op: "createAd", args }] });
      const calls = fakeGraph(adRoutes());
      const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args }, deps);
      expect(res.status).toBe(409);
      expect(calls.some((c) => c.method === "POST")).toBe(false);
    }
  });

  it("reads where an ad set's ads go, for the card", async () => {
    fakeGraph(adRoutes());
    const res = await callMetaOp(world().client(), { messageId: MSG, tenantId: T1, op: "read.destination", args: { adsetId: "9" } }, deps);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ cta: "SIGN_UP", link: "http://fb.me/", leadFormId: "FORM1" });
    fakeGraph(adRoutes({ "GET /9": { ...ADSET_9, account_id: "200" } }));
    expect((await callMetaOp(world().client(), { messageId: MSG, tenantId: T1, op: "read.destination", args: { adsetId: "9" } }, deps)).status).toBe(403);
  });

  it("refuses a new ad when the client has no Facebook Page set", async () => {
    const w = world({ ops: [{ op: "createAd", args: AD }], tenant: { meta_page_id: null } });
    const calls = fakeGraph(adRoutes());
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps);
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/set the client's Page first/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(w.rows("admin_audit_log")).toEqual([]);
  });

  it("refuses when the ad set's ads use a Page that is not the client's", async () => {
    const w = world({ ops: [{ op: "createAd", args: AD }], tenant: { meta_page_id: "PAGE9" } });
    const calls = fakeGraph(adRoutes());
    const res = await callMetaOp(w.client(), { messageId: MSG, tenantId: T1, op: "createAd", args: AD }, deps);
    expect(res.status).toBe(409);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("source", () => {
  it("meta-ops.ts reaches Meta only through callMetaOp", () => {
    const imports = [...endpointSource.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      "../../lib/adCreativeFiles",
      "../../lib/agentMetaOps",
      "../../lib/env",
      "../../lib/metaToken",
      "../../lib/supabase",
    ]);
    expect(endpointSource).not.toMatch(/graph\.facebook|fetch\(/);
  });

  it("agentMetaOps never reaches for a Page token, a delete or a new campaign", () => {
    expect(libSource).not.toMatch(/metaPages|access_token=.*page|listReachablePages/);
    expect(libSource).not.toMatch(/method:\s*"DELETE"/);
    expect(libSource).not.toMatch(/\/campaigns["`],\s*\{\s*method|\/adsets["`],\s*\{\s*method/);
  });
});
