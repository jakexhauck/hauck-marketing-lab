import { describe, it, expect } from "vitest";
import metaSource from "../api/agent-runner/meta.ts?raw";
import { metaQuery } from "../api/agent-runner/meta";
import { FakeDb } from "./agentFakeDb";
import {
  AGENT_RUNNER_GET_PATHS,
  AGENT_RUNNER_POST_PATHS,
  STALE_SECONDS,
  applyReply,
  claimNext,
  heartbeat,
  isAgentRunnerRequest,
  lessonInScope,
  messageFromRow,
  reclaimStale,
  replaceLessons,
  stripEmDash,
} from "./agentRunner";

const EM = String.fromCharCode(0x2014);

const SECRET = "7c2e91a4b5d86f30a1c7e5b2d84f60a1c7e5b2d8a1c7e5b2d84f60a1c7e5b2d8";
const T1 = "11111111-1111-4111-8111-111111111111";

function ask(over: Partial<{ method: string; path: string; header: string | null; secret?: string }> = {}) {
  return isAgentRunnerRequest(
    over.method ?? "POST",
    over.path ?? "/api/agent-runner/claim",
    "header" in over ? over.header! : SECRET,
    "secret" in over ? over.secret : SECRET,
  );
}

describe("agent runner gate", () => {
  it("lets every exact path through with its own method and the right secret", () => {
    for (const p of AGENT_RUNNER_POST_PATHS) expect(ask({ path: p }), p).toBe(true);
    for (const p of AGENT_RUNNER_GET_PATHS) expect(ask({ method: "GET", path: p }), p).toBe(true);
  });

  it("is exactly the paths the runner calls", () => {
    expect([...AGENT_RUNNER_POST_PATHS].sort()).toEqual(
      ["auto-chat", "brief", "claim", "file-asset", "file-creative", "ghl", "heartbeat", "item", "lessons", "read-url", "reply", "upload-url"].map((p) => `/api/agent-runner/${p}`),
    );
    expect([...AGENT_RUNNER_GET_PATHS].sort()).toEqual(
      ["meta", "snapshot", "tenants"].map((p) => `/api/agent-runner/${p}`),
    );
  });

  it("refuses a prefix, a suffix or a neighbouring path", () => {
    for (const path of [
      "/api/agent-runner",
      "/api/agent-runner/",
      "/api/agent-runner/claim/",
      "/api/agent-runner/claimx",
      "/api/agent-runner/claim/../../admin/clients",
      "/api/admin/agents/chats",
      "/api/admin/clients",
    ]) {
      expect(ask({ path }), path).toBe(false);
    }
  });

  it("refuses the wrong method for a path", () => {
    expect(ask({ method: "GET", path: "/api/agent-runner/claim" })).toBe(false);
    expect(ask({ method: "POST", path: "/api/agent-runner/meta" })).toBe(false);
    for (const method of ["PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]) {
      expect(ask({ method }), method).toBe(false);
    }
  });

  it("refuses a wrong, missing or partial secret", () => {
    expect(ask({ header: "0".repeat(SECRET.length) })).toBe(false);
    expect(ask({ header: null })).toBe(false);
    expect(ask({ header: SECRET.slice(0, 20) })).toBe(false);
  });

  it("stays shut when the configured secret is short or unset", () => {
    expect(ask({ secret: "short", header: "short" })).toBe(false);
    expect(ask({ secret: undefined, header: "" })).toBe(false);
    expect(ask({ secret: "", header: "" })).toBe(false);
  });
});

function chat(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: T1,
    agent: "ads",
    title: "New chat",
    auto: false,
    claude_session_id: `sess-${id}`,
    started: false,
    created_at: "2026-10-17T09:00:00.000Z",
    updated_at: "2026-10-17T09:00:00.000Z",
    ...over,
  };
}

function msg(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    chat_id: "c1",
    role: "me",
    body: "hello",
    meta: {},
    status: "queued",
    host: null,
    error: null,
    created_at: "2026-10-17T10:00:00.000Z",
    updated_at: "2026-10-17T10:00:00.000Z",
    ...over,
  };
}

describe("reclaimStale", () => {
  it("puts back only this host's running messages that stopped moving", async () => {
    const db = new FakeDb().setNow("2026-10-17T12:00:00.000Z").seed("agent_messages", [
      // Mine, untouched for 11 minutes: the runner died. Back to queued.
      msg("stale-mine", { status: "running", host: "PC", updated_at: "2026-10-17T11:49:00.000Z" }),
      // Mine, touched 5 minutes ago: still being worked.
      msg("fresh-mine", { status: "running", host: "PC", updated_at: "2026-10-17T11:55:00.000Z" }),
      // Another host's, equally stale: not ours to take.
      msg("stale-other", { status: "running", host: "MAC", updated_at: "2026-10-17T11:00:00.000Z" }),
      // Done long ago: never touched.
      msg("done-mine", { status: "done", host: "PC", updated_at: "2026-10-17T08:00:00.000Z" }),
    ]);
    const n = await reclaimStale(db.client(), "PC", STALE_SECONDS, new Date("2026-10-17T12:00:00.000Z"));
    expect(n).toBe(1);
    const status = Object.fromEntries(db.rows("agent_messages").map((r) => [r.id, r.status]));
    expect(status).toEqual({
      "stale-mine": "queued",
      "fresh-mine": "running",
      "stale-other": "running",
      "done-mine": "done",
    });
  });
});

describe("claimNext", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");

  it("claims a message queued while no runner was alive", async () => {
    // No agent_runner_state rows at all: the PC was off when Jake sent it.
    const db = new FakeDb()
      .seed("tenants", [{ id: T1, name: "Willis Windows", slug: "willis", meta_ad_account_id: "act_1" }])
      .seed("agent_chats", [chat("c1")])
      .seed("agent_messages", [msg("m1", { created_at: "2026-10-16T22:00:00.000Z" })]);
    const res = await claimNext(db.client(), "PC", now);
    expect(res?.message.id).toBe("m1");
    expect(res?.message.status).toBe("running");
    expect(res?.chat).toMatchObject({ id: "c1", agent: "ads", claudeSessionId: "sess-c1", started: false });
    expect(res?.tenant).toEqual({ id: T1, name: "Willis Windows", slug: "willis", metaAdAccountId: "act_1" });
    expect(db.rows("agent_messages")[0]).toMatchObject({ status: "running", host: "PC" });
  });

  it("takes the oldest queued me message and ignores ai rows", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1", { tenant_id: null, agent: "manager" })])
      .seed("agent_messages", [
        msg("newer", { created_at: "2026-10-17T11:00:00.000Z" }),
        msg("ai", { role: "ai", created_at: "2026-10-17T09:00:00.000Z" }),
        msg("older", { created_at: "2026-10-17T10:00:00.000Z" }),
      ]);
    const res = await claimNext(db.client(), "PC", now);
    expect(res?.message.id).toBe("older");
    expect(res?.tenant).toBeNull();
  });

  it("returns null when nothing is queued", async () => {
    const db = new FakeDb().seed("agent_messages", [msg("m1", { status: "done" })]);
    expect(await claimNext(db.client(), "PC", now)).toBeNull();
  });

  it("re-runs a message its runner died on, in the same chat session", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1", { started: true })])
      .seed("agent_messages", [msg("m1", { status: "running", host: "PC", updated_at: "2026-10-17T11:40:00.000Z" })]);
    const res = await claimNext(db.client(), "PC", now);
    expect(res?.message.id).toBe("m1");
    expect(res?.chat.claudeSessionId).toBe("sess-c1");
    expect(res?.chat.started).toBe(true);
  });

  it("sends the earlier messages as history, oldest first", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1")])
      .seed("agent_messages", [
        msg("a2", { role: "ai", status: "done", body: "second", created_at: "2026-10-17T09:30:00.000Z" }),
        msg("a1", { role: "me", status: "done", body: "first", created_at: "2026-10-17T09:00:00.000Z" }),
        msg("m3", { created_at: "2026-10-17T10:00:00.000Z" }),
      ]);
    const res = await claimNext(db.client(), "PC", now);
    expect(res?.message.id).toBe("m3");
    expect(res?.history.map((m) => m.id)).toEqual(["a1", "a2"]);
  });
});

describe("applyReply", () => {
  function setup() {
    return new FakeDb()
      .seed("agent_chats", [chat("c1")])
      .seed("agent_messages", [msg("m1", { status: "running", host: "PC" })]);
  }

  // Progress posts are fire-and-forget, so one can arrive after the reply.
  it("ignores a late progress post once the reply is done", async () => {
    const db = setup();
    const client = db.client();
    await applyReply(client, { messageId: "m1", status: "done", aiBody: "Final answer" });
    expect(await applyReply(client, { messageId: "m1", status: "running", aiBody: "Still work" })).toEqual({ ok: true });
    const ai = db.rows("agent_messages").filter((r) => r.role === "ai");
    expect(ai[0]).toMatchObject({ status: "done", body: "Final answer" });
    expect(db.rows("agent_messages").find((r) => r.id === "m1")?.status).toBe("done");
  });

  it("creates the ai message on the first post and updates it after", async () => {
    const db = setup();
    const client = db.client();
    expect(await applyReply(client, { messageId: "m1", status: "running", aiBody: "Looking", tools: ["Read"] })).toEqual({
      ok: true,
    });
    expect(
      await applyReply(client, {
        messageId: "m1",
        status: "done",
        aiBody: `CPL fell ${EM} good week`,
        tools: ["Read", "Bash"],
        used: ["Before/after wins"],
        learned: ["Tuesday ads flop"],
        title: "CPL this week",
      }),
    ).toEqual({ ok: true });

    const ai = db.rows("agent_messages").filter((r) => r.role === "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({
      chat_id: "c1",
      status: "done",
      body: "CPL fell, good week",
      meta: { replyTo: "m1", tools: ["Read", "Bash"], used: ["Before/after wins"], learned: ["Tuesday ads flop"] },
    });
    expect(db.rows("agent_messages").find((r) => r.id === "m1")?.status).toBe("done");
    expect(db.rows("agent_chats")[0]).toMatchObject({ title: "CPL this week", started: true });
  });

  it("keeps a title the chat already has", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1", { title: "Startup check", started: true })])
      .seed("agent_messages", [msg("m1", { status: "running" })]);
    await applyReply(db.client(), { messageId: "m1", status: "done", aiBody: "ok", title: "Other" });
    expect(db.rows("agent_chats")[0].title).toBe("Startup check");
  });

  it("records an error on both rows", async () => {
    const db = setup();
    await applyReply(db.client(), { messageId: "m1", status: "error", error: "claude exited 1" });
    const me = db.rows("agent_messages").find((r) => r.id === "m1");
    expect(me).toMatchObject({ status: "error", error: "claude exited 1" });
  });

  it("answers 404 for an unknown message", async () => {
    const db = setup();
    expect(await applyReply(db.client(), { messageId: "nope", status: "done" })).toEqual({ error: 404 });
  });
});

describe("heartbeat", () => {
  it("records the host, stamps a monitor run, and hands back queued edits", async () => {
    const db = new FakeDb()
      .setNow("2026-10-17T12:00:00.000Z")
      .seed("agent_lesson_edits", [
        { id: "e1", lesson_id: "l-aaaa0001", action: "delete", text: null, status: "queued", created_at: "2026-10-17T10:00:00.000Z" },
        { id: "e2", lesson_id: "l-aaaa0002", action: "edit", text: "x", status: "applied", created_at: "2026-10-17T09:00:00.000Z" },
      ]);
    const first = await heartbeat(db.client(), { host: "PC" }, new Date("2026-10-17T12:00:00.000Z"));
    expect(first.lastMonitorAt).toBeNull();
    expect(first.queuedEdits).toEqual([{ id: "e1", lessonId: "l-aaaa0001", action: "delete", text: null }]);

    const second = await heartbeat(db.client(), { host: "PC", monitored: true }, new Date("2026-10-17T12:01:00.000Z"));
    expect(second.lastMonitorAt).toBe("2026-10-17T12:01:00.000Z");
    expect(db.rows("agent_runner_state")).toHaveLength(1);
  });
});

describe("lessons mirror", () => {
  const lesson = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    scope: "client" as const,
    tenantId: T1,
    agent: "ads" as const,
    text: "t",
    source: "chat",
    learnedOn: "2026-10-17",
    ...over,
  });

  it("matches a lesson to its brain file", () => {
    expect(lessonInScope(lesson("a"), { scope: "client", tenantId: T1, agent: "ads" })).toBe(true);
    expect(lessonInScope(lesson("a"), { scope: "client", tenantId: T1, agent: "ghl" })).toBe(false);
    expect(lessonInScope(lesson("a"), { scope: "client", tenantId: "other", agent: "ads" })).toBe(false);
    expect(lessonInScope(lesson("a", { scope: "agent" }), { scope: "agent", tenantId: null, agent: "ads" })).toBe(true);
    expect(lessonInScope(lesson("a", { scope: "agent" }), { scope: "agent", tenantId: null, agent: "ghl" })).toBe(false);
    expect(lessonInScope(lesson("a", { scope: "manager", agent: "manager" }), { scope: "manager", tenantId: null, agent: "manager" })).toBe(true);
  });

  it("replaces only the named scopes and marks the edits applied", async () => {
    const db = new FakeDb()
      .seed("agent_lessons", [
        { id: "l-old", scope: "client", tenant_id: T1, agent: "ads", text: "gone", source: "", learned_on: null },
        { id: "l-keep", scope: "agent", tenant_id: null, agent: "ghl", text: "stays", source: "", learned_on: null },
        // Same client brain, another agent's slice, not in this post: kept.
        { id: "l-ghl", scope: "client", tenant_id: T1, agent: "ghl", text: "stays", source: "", learned_on: null },
      ])
      .seed("agent_lesson_edits", [{ id: "e1", lesson_id: "l-old", action: "delete", text: null, status: "queued" }]);
    const res = await replaceLessons(db.client(), {
      scopes: [{ scope: "client", tenantId: T1, agent: "ads" }],
      lessons: [lesson("l-new"), lesson("l-stray", { tenantId: "other" })],
      appliedEditIds: ["e1"],
    });
    expect(res).toEqual({ ok: true, saved: 1 });
    expect(db.rows("agent_lessons").map((r) => r.id).sort()).toEqual(["l-ghl", "l-keep", "l-new"]);
    expect(db.rows("agent_lesson_edits")[0].status).toBe("applied");
  });
});

describe("helpers", () => {
  it("strips em dashes from agent text", () => {
    expect(stripEmDash(`one ${EM} two${EM}three`)).toBe("one, two, three");
  });

  it("maps a request row", () => {
    const m = messageFromRow(msg("r1", { role: "request", status: "done", meta: { itemId: "i1", fromAgent: "landing" } }));
    expect(m).toMatchObject({ role: "request", itemId: "i1", fromAgent: "landing", tools: [], used: [], learned: [] });
  });
});

describe("meta endpoint stays read-only", () => {
  it("imports nothing that can write to Meta", () => {
    const src = metaSource;
    for (const banned of ["metaActions", "metaUpload", "metaLeadForm", "metaCapi"]) {
      expect(src.includes(banned), `meta.ts must not import ${banned}`).toBe(false);
    }
    // And the only Graph helper it reaches for is a GET.
    expect(src).toMatch(/from "\.\.\/\.\.\/lib\/metaGraph"/);
    expect(src).not.toMatch(/method:\s*"(POST|DELETE)"/);
  });
});

describe("meta query", () => {
  it("picks the smallest Meta window that covers the days", () => {
    expect(metaQuery(null, null)).toEqual({ level: "account", preset: "last_7d" });
    expect(metaQuery("ad", "1")).toEqual({ level: "ad", preset: "yesterday" });
    expect(metaQuery("campaign", "10")).toEqual({ level: "campaign", preset: "last_14d" });
    expect(metaQuery("campaign", "90")).toEqual({ level: "campaign", preset: "last_90d" });
  });
  it("refuses a level or a window it does not serve", () => {
    expect(metaQuery("adset", "7")).toBeNull();
    expect(metaQuery("account", "0")).toBeNull();
    expect(metaQuery("account", "91")).toBeNull();
    expect(metaQuery("account", "x")).toBeNull();
  });
});
