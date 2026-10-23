import { afterEach, describe, expect, it, vi } from "vitest";
import endpointSource from "../api/agent-runner/ghl.ts?raw";
import { FakeDb } from "./agentFakeDb";
import {
  GHL_OPS,
  callGhlOp,
  isSecretValue,
  isSecretValueName,
  isWriteOp,
  parseOpArgs,
  writeAllowed,
  type GhlCallerChat,
  type GhlGrantItem,
} from "./agentGhlOps";
import type { AgentMessage } from "../../src/lib/agentWire";
import type { GhlContext } from "./ghl";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const MSG = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";

function msg(over: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: MSG,
    chatId: "c1",
    role: "me",
    body: "Set the winter page link",
    status: "running",
    tools: [],
    used: [],
    learned: [],
    itemId: null,
    fromAgent: null,
    followUpOf: null,
    grant: null,
    answerOf: null,
    error: null,
    createdAt: "2026-10-17T09:00:00.000Z",
    ...over,
  };
}

const chat = (over: Partial<GhlCallerChat> = {}): GhlCallerChat => ({ agent: "ghl", tenantId: T1, auto: false, ...over });
const approved = (over: Partial<GhlGrantItem> = {}): GhlGrantItem => ({
  id: ITEM,
  agent: "ghl",
  tenantId: T1,
  approvedAt: "2026-10-17T09:30:00.000Z",
  ...over,
});
const grant = { itemId: ITEM, kind: "ghl" as const, limit: null };

describe("writeAllowed", () => {
  it("allows Jake's direct ask in an ordinary ghl chat", () => {
    expect(writeAllowed(msg(), chat())).toBe(true);
  });

  it("refuses another agent's answer, which reads like a direct ask but is not Jake", () => {
    expect(writeAllowed(msg({ role: "request", fromAgent: "research", answerOf: ITEM }), chat())).toBe(false);
  });

  it("refuses an Auto chat, whatever the message says", () => {
    expect(writeAllowed(msg(), chat({ auto: true }))).toBe(false);
  });

  it("refuses a follow-up to a card without an approval grant", () => {
    expect(writeAllowed(msg({ followUpOf: ITEM, body: "Declined: x" }), chat())).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, body: "Change the name" }), chat(), approved())).toBe(false);
  });

  it("allows an approved ghl grant, even in an Auto chat", () => {
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved())).toBe(true);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat({ auto: true }), approved())).toBe(true);
  });

  it("refuses a grant of another kind, or one the card does not back up", () => {
    expect(writeAllowed(msg({ followUpOf: ITEM, grant: { ...grant, kind: "deploy" } }), chat(), approved())).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat())).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ approvedAt: null }))).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ agent: "ads" }))).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ tenantId: T2 }))).toBe(false);
    expect(writeAllowed(msg({ followUpOf: ITEM, grant }), chat(), approved({ id: "other" }))).toBe(false);
    expect(writeAllowed(msg({ followUpOf: "other", grant }), chat(), approved())).toBe(false);
  });

  it("a Director trigger writes only on an Acts live task, only in a GHL chat, only while running", () => {
    expect(writeAllowed(msg({ role: "trigger", live: false }), chat())).toBe(false);
    expect(writeAllowed(msg({ role: "trigger" }), chat())).toBe(false);
    expect(writeAllowed(msg({ role: "trigger", live: true }), chat())).toBe(true);
    expect(writeAllowed(msg({ role: "trigger", live: true }), chat({ agent: "ads" }))).toBe(false);
    expect(writeAllowed(msg({ role: "trigger", live: true, status: "done" }), chat())).toBe(false);
    // A grant on a trigger changes nothing: an approval only ever rides on Jake's follow-up.
    expect(writeAllowed(msg({ role: "trigger", live: false, followUpOf: ITEM, grant }), chat(), approved())).toBe(false);
  });

  it("live means nothing on Jake's own message", () => {
    expect(writeAllowed(msg({ live: true }), chat({ auto: true }))).toBe(false);
  });

  it("refuses anything not a running message of Jake's in a ghl chat", () => {
    expect(writeAllowed(msg({ status: "done" }), chat())).toBe(false);
    expect(writeAllowed(msg({ role: "request" }), chat())).toBe(false);
    expect(writeAllowed(msg({ role: "ai" }), chat())).toBe(false);
    expect(writeAllowed(msg(), chat({ agent: "ads" }))).toBe(false);
  });
});

describe("GHL_OPS", () => {
  it("is exactly the planned allowlist, reads open and writes gated", () => {
    expect(Object.keys(GHL_OPS).sort()).toEqual([
      "read.calendars",
      "read.customFields",
      "read.customValues",
      "read.pipelines",
      "write.customField",
      "write.customValue",
      "write.moveOpportunity",
      "write.tag",
    ]);
    for (const op of Object.keys(GHL_OPS)) expect(isWriteOp(op), op).toBe(op.startsWith("write."));
  });

  it("checks args before anything is sent", () => {
    expect(parseOpArgs("read.pipelines", undefined)).toEqual({ ok: true, args: {} });
    expect(parseOpArgs("write.customValue", { key: "Winter Page", value: "https://x.pages.dev" })).toEqual({
      ok: true,
      args: { key: "Winter Page", value: "https://x.pages.dev" },
    });
    expect(parseOpArgs("write.customValue", { key: " ", value: "x" }).ok).toBe(false);
    expect(parseOpArgs("write.customValue", { key: "a", value: 3 }).ok).toBe(false);
    expect(parseOpArgs("write.customField", { name: "Roof age", type: "NUMERICAL" }).ok).toBe(true);
    expect(parseOpArgs("write.customField", { name: "Roof age", type: "SCRIPT" }).ok).toBe(false);
    expect(parseOpArgs("write.tag", { contactId: "abc", tag: "winter" }).ok).toBe(true);
    expect(parseOpArgs("write.tag", { contactId: "../x", tag: "winter" }).ok).toBe(false);
    expect(parseOpArgs("write.moveOpportunity", { opportunityId: "o1", pipelineId: "p1", stageId: "s1" }).ok).toBe(true);
    expect(parseOpArgs("write.moveOpportunity", { opportunityId: "o1", pipelineId: "p1" }).ok).toBe(false);
    expect(parseOpArgs("delete.everything", {}).ok).toBe(false);
  });

  it("knows a secret custom value by its name", () => {
    for (const n of ["Location API Token", "Facebook Access Token", "Stripe Secret", "Portal Password", "API Key"]) {
      expect(isSecretValueName(n), n).toBe(true);
    }
    for (const n of ["Call Now Link", "Business Name", "Keyword", "Facebook Dataset ID", "Monkey Bars", "Author Bio"]) {
      expect(isSecretValueName(n), n).toBe(false);
    }
  });

  it("also knows auth, credentials, a key on its own, and a signed link", () => {
    for (const n of ["Basic Auth", "OAuth Client", "Authorization Header", "Zapier Credential", "Credentials", "Webhook Key", "key", "Stripe_Key", "license-key"]) {
      expect(isSecretValueName(n), n).toBe(true);
    }
    for (const v of [
      "https://hooks.example.com/x?token=abc",
      "https://api.example.com/v1?a=1&api_key=abc",
      "https://storage.example.com/f.png?X-Amz-Signature=abc&X-Amz-Expires=60",
      "https://x.example.com/p?sig=abc",
      "https://x.example.com/p?access_token=abc",
      "https://x.example.com/p?key=abc",
    ]) {
      expect(isSecretValue("Winter Page", v), v).toBe(true);
    }
    for (const v of ["https://hm-willis.pages.dev", "https://x.example.com/p?utm_source=fb&page=2", "token=abc", "Free estimate"]) {
      expect(isSecretValue("Winter Page", v), v).toBe(false);
    }
    expect(isSecretValue("API Key", "anything")).toBe(true);
  });
});

// ---- the endpoint's core, against a fake DB and a fake GHL ----------------

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function fakeGhl(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null });
      const key = `${method} ${new URL(url).pathname}`;
      const hit = Object.entries(routes).find(([k]) => k === key);
      return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const G: GhlContext = { token: "tok", locationId: "LOC1" };

function world(over: { message?: Record<string, unknown>; chat?: Record<string, unknown>; items?: Record<string, unknown>[] } = {}) {
  return new FakeDb()
    .seed("agent_chats", [{ id: "c1", tenant_id: T1, agent: "ghl", auto: false, user_id: ADMIN, ...over.chat }])
    .seed("agent_messages", [
      { id: MSG, chat_id: "c1", role: "me", body: "Set it", status: "running", meta: {}, ...over.message },
    ])
    .seed("agent_items", over.items ?? [])
    .seed("admin_accounts", [{ id: ADMIN, role: "owner", status: "active" }]);
}

const deps = { ghl: async () => G };

const CV_LIST = {
  customValues: [
    { id: "v1", name: "Winter Page", value: "old", fieldKey: "{{ custom_values.winter_page }}" },
    { id: "v2", name: "Location API Token", value: "pit-secret", fieldKey: "{{ custom_values.location_api_token }}" },
    { id: "v3", name: "Open Lead", value: "https://app", fieldKey: "{{ custom_values.open_lead }}" },
    { id: "v4", name: "Zap Hook", value: "https://hooks.zapier.com/x?token=zap-secret", fieldKey: "{{ custom_values.zap_hook }}" },
  ],
};

describe("callGhlOp", () => {
  it("runs a read for the ghl chat's own client, with secrets blanked", async () => {
    const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST });
    const res = await callGhlOp(world().client(), { messageId: MSG, tenantId: T1, op: "read.customValues" }, deps);
    expect(res.status).toBe(200);
    const rows = res.body.result as { name: string; value: string }[];
    expect(rows.find((r) => r.name === "Winter Page")?.value).toBe("old");
    expect(rows.find((r) => r.name === "Location API Token")?.value).toBe("(hidden)");
    expect(rows.find((r) => r.name === "Zap Hook")?.value).toBe("(hidden)");
    expect(JSON.stringify(res.body)).not.toContain("pit-secret");
    expect(JSON.stringify(res.body)).not.toContain("zap-secret");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("answers 400 for an unknown op and never calls GHL", async () => {
    const calls = fakeGhl({});
    const res = await callGhlOp(world().client(), { messageId: MSG, tenantId: T1, op: "write.deleteContact" }, deps);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses another client's tenant, another agent's chat and a finished message", async () => {
    fakeGhl({ "GET /opportunities/pipelines": { pipelines: [] } });
    const body = { messageId: MSG, op: "read.pipelines" };
    expect((await callGhlOp(world().client(), { ...body, tenantId: T2 }, deps)).status).toBe(403);
    expect((await callGhlOp(world({ chat: { agent: "ads" } }).client(), { ...body, tenantId: T1 }, deps)).status).toBe(403);
    expect((await callGhlOp(world({ message: { status: "done" } }).client(), { ...body, tenantId: T1 }, deps)).status).toBe(403);
    expect((await callGhlOp(world().client(), { ...body, messageId: "55555555-5555-4555-8555-000000000000", tenantId: T1 }, deps)).status).toBe(403);
  });

  it("lets the CSM read its own client and the Manager read any client, and neither write", async () => {
    fakeGhl({ "GET /opportunities/pipelines": { pipelines: [] }, "GET /locations/LOC1/customValues": CV_LIST });
    const read = { messageId: MSG, tenantId: T1, op: "read.pipelines" };
    expect((await callGhlOp(world({ chat: { agent: "csm" } }).client(), read, deps)).status).toBe(200);
    expect((await callGhlOp(world({ chat: { agent: "manager", tenant_id: null } }).client(), read, deps)).status).toBe(200);
    expect((await callGhlOp(world({ chat: { agent: "csm" } }).client(), { ...read, tenantId: T2 }, deps)).status).toBe(403);
    expect((await callGhlOp(world({ chat: { agent: "research" } }).client(), read, deps)).status).toBe(403);
    const write = { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "winter page", value: "https://new" } };
    const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    expect((await callGhlOp(world({ chat: { agent: "csm" } }).client(), write, deps)).status).toBe(403);
    expect((await callGhlOp(world({ chat: { agent: "manager", tenant_id: null } }).client(), write, deps)).status).toBe(403);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("lets a Director trigger read, and write only when its tasks act live", async () => {
    const write = { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "winter page", value: "https://new" } };
    fakeGhl({ "GET /opportunities/pipelines": { pipelines: [] } });
    const read = await callGhlOp(world({ message: { role: "trigger", meta: { live: false } } }).client(), { messageId: MSG, tenantId: T1, op: "read.pipelines" }, deps);
    expect(read.status).toBe(200);
    let calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    expect((await callGhlOp(world({ message: { role: "trigger", meta: { live: false } } }).client(), write, deps)).status).toBe(403);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    const liveWorld = world({ message: { role: "trigger", meta: { live: true, taskKeys: ["ghl:x"] } } });
    liveWorld.seed("client_tasks", [{ id: "t1", tenant_id: T1, key: "ghl:x", owner: "ghl", state: "doing", mode: "live" }]);
    expect((await callGhlOp(liveWorld.client(), write, deps)).status).toBe(200);
    expect(calls.some((c) => c.method === "PUT")).toBe(true);
  });

  it("checks Acts live again at the write: a task switched back, cut, deleted or another agent's stops it", async () => {
    const write = { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "winter page", value: "https://new" } };
    const base = { id: "t1", tenant_id: T1, key: "ghl:x", owner: "ghl", state: "doing", mode: "live" };
    for (const [why, rows] of [
      ["switched to Needs your OK", [{ ...base, mode: "ask" }]],
      ["cut", [{ ...base, state: "cut" }]],
      ["deleted", []],
      ["not a GHL task", [{ ...base, owner: "ads" }]],
    ] as const) {
      const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
      const db = world({ message: { role: "trigger", meta: { live: true, taskKeys: ["ghl:x"] } } });
      db.seed("client_tasks", [...rows]);
      expect((await callGhlOp(db.client(), write, deps)).status, why).toBe(403);
      expect(calls.some((c) => c.method === "PUT"), why).toBe(false);
    }
  });

  it("writes on Jake's direct ask and logs it as agent:ghl first", async () => {
    const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    const db = world();
    const res = await callGhlOp(
      db.client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "winter page", value: "https://new" } },
      deps,
    );
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ action: "updated", name: "Winter Page", before: "old", after: "https://new" });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({ name: "Winter Page", value: "https://new" });
    const log = db.rows("admin_audit_log");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ admin_id: ADMIN, action: "agent:ghl.write.customValue", target_tenant_id: T1 });
    expect(log[0].payload).toMatchObject({ messageId: MSG, args: { key: "winter page", value: "https://new" } });
  });

  it("finds a value by its exact merge key, never by a part of one", async () => {
    let calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    await callGhlOp(
      world().client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "{{custom_values.winter_page}}", value: "z" } },
      deps,
    );
    expect(calls.find((c) => c.method === "PUT")?.url).toContain("/customValues/v1");

    calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "POST /locations/LOC1/customValues": {} });
    await callGhlOp(
      world().client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "page", value: "z" } },
      deps,
    );
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "page", value: "z" });
  });

  it("creates a custom value that does not exist yet", async () => {
    const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "POST /locations/LOC1/customValues": {} });
    const res = await callGhlOp(
      world().client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "Spring Page", value: "https://s" } },
      deps,
    );
    expect(res.body.result).toEqual({ action: "created", name: "Spring Page", before: null, after: "https://s" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Spring Page", value: "https://s" });
  });

  it("will not write a secret value or the app's own Open Lead", async () => {
    for (const key of ["Location API Token", "Open Lead"]) {
      const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST });
      const res = await callGhlOp(
        world().client(),
        { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key, value: "x" } },
        deps,
      );
      expect(res.status, key).toBe(409);
      expect(calls.some((c) => c.method !== "GET"), key).toBe(false);
    }
  });

  it("refuses a write in an Auto chat and in a follow-up without approval, and logs nothing", async () => {
    for (const w of [
      world({ chat: { auto: true } }),
      world({ message: { meta: { followUpOf: ITEM } } }),
      world({ message: { meta: { followUpOf: ITEM, grant: { itemId: ITEM, kind: "ghl", limit: null } } } }),
    ]) {
      const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
      const res = await callGhlOp(
        w.client(),
        { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "Winter Page", value: "y" } },
        deps,
      );
      expect(res.status).toBe(403);
      expect(calls).toEqual([]);
      expect(w.rows("admin_audit_log")).toEqual([]);
    }
  });

  it("writes on an approved request card", async () => {
    fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    const db = world({
      chat: { auto: true, user_id: null },
      message: { meta: { followUpOf: ITEM, grant: { itemId: ITEM, kind: "ghl", limit: null } } },
      items: [{
        id: ITEM, tenant_id: T1, agent: "ghl", status: "done", title: "Winter page", approved_at: "2026-10-17T09:30:00.000Z",
        payload: { grant: { kind: "ghl" }, ops: [{ op: "write.customValue", args: { key: "Winter Page", value: "https://live" } }] },
      }],
    });
    const res = await callGhlOp(
      db.client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "Winter Page", value: "https://live" } },
      deps,
    );
    expect(res.status).toBe(200);
    // No user on an Auto chat: the owner account carries the audit row.
    expect(db.rows("admin_audit_log")[0]).toMatchObject({ admin_id: ADMIN, payload: { itemId: ITEM } });
  });

  it("under an approval, writes only an op and args that are on the approved card", async () => {
    const approved = (ops: unknown) =>
      world({
        message: { meta: { followUpOf: ITEM, grant: { itemId: ITEM, kind: "ghl", limit: null } } },
        items: [{
          id: ITEM, tenant_id: T1, agent: "ghl", status: "done", title: "Winter page", approved_at: "2026-10-17T09:30:00.000Z",
          payload: { grant: { kind: "ghl" }, ...(ops === undefined ? {} : { ops }) },
        }],
      });
    const onCard = [{ op: "write.customValue", args: { key: "Winter Page", value: "https://live" } }];
    for (const [ops, body] of [
      [onCard, { op: "write.customValue", args: { key: "Winter Page", value: "https://evil" } }],
      [onCard, { op: "write.customValue", args: { key: "Other Page", value: "https://live" } }],
      [onCard, { op: "write.tag", args: { contactId: "c1", tag: "x" } }],
      [undefined, { op: "write.customValue", args: { key: "Winter Page", value: "https://live" } }],
      ["nope", { op: "write.customValue", args: { key: "Winter Page", value: "https://live" } }],
    ] as const) {
      const db = approved(ops);
      const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
      const res = await callGhlOp(db.client(), { messageId: MSG, tenantId: T1, ...body }, deps);
      expect(res.status).toBe(403);
      expect(calls).toEqual([]);
      expect(db.rows("admin_audit_log")).toEqual([]);
    }
    // The same op and args (whitespace trimmed the same way) go through.
    const db = approved(onCard);
    fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    const ok = await callGhlOp(
      db.client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: " Winter Page ", value: "https://live" } },
      deps,
    );
    expect(ok.status).toBe(200);
  });

  it("moves an opportunity only to a stage that exists in that pipeline", async () => {
    const pipes = { pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "s1", name: "Lead" }] }] };
    let calls = fakeGhl({ "GET /opportunities/pipelines": pipes, "PUT /opportunities/o1": {} });
    const bad = await callGhlOp(
      world().client(),
      { messageId: MSG, tenantId: T1, op: "write.moveOpportunity", args: { opportunityId: "o1", pipelineId: "p1", stageId: "s9" } },
      deps,
    );
    expect(bad.status).toBe(400);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    calls = fakeGhl({ "GET /opportunities/pipelines": pipes, "PUT /opportunities/o1": {} });
    const ok = await callGhlOp(
      world().client(),
      { messageId: MSG, tenantId: T1, op: "write.moveOpportunity", args: { opportunityId: "o1", pipelineId: "p1", stageId: "s1" } },
      deps,
    );
    expect(ok.status).toBe(200);
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ pipelineId: "p1", pipelineStageId: "s1" });
  });

  it("refuses the write when the audit row cannot be saved", async () => {
    const calls = fakeGhl({ "GET /locations/LOC1/customValues": CV_LIST, "PUT /locations/LOC1/customValues/v1": {} });
    const db = new FakeDb()
      .seed("agent_chats", [{ id: "c1", tenant_id: T1, agent: "ghl", auto: false, user_id: null }])
      .seed("agent_messages", [{ id: MSG, chat_id: "c1", role: "me", body: "x", status: "running", meta: {} }]);
    const res = await callGhlOp(
      db.client(),
      { messageId: MSG, tenantId: T1, op: "write.customValue", args: { key: "Winter Page", value: "y" } },
      deps,
    );
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("api/agent-runner/ghl.ts", () => {
  it("reaches GHL only through callGhlOp", () => {
    const imports = [...endpointSource.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["../../lib/agentGhlOps", "../../lib/env", "../../lib/supabase", "../../lib/tenantGhl"]);
    expect(endpointSource).not.toMatch(/ghlFetch|ghlJson|fetch\(/);
  });
});
