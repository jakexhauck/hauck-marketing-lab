import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import {
  chatSummaries,
  createAutoChat,
  decideItem,
  parseTenantParam,
  scopeFilter,
  transitionItem,
  upsertItem,
  runnerStatus,
  brainLessons,
  queueLessonEdit,
} from "./agentItems";

const EM = String.fromCharCode(0x2014);

const T1 = "11111111-1111-4111-8111-111111111111";

describe("transitionItem", () => {
  const item = { status: "needs_ok" as const, title: "Spring offer ad" };

  it("approves only from needs_ok", () => {
    expect(transitionItem(item, "approve")).toEqual({ next: "done", followUp: "Approved: Spring offer ad" });
    for (const status of ["building", "live", "done", "declined"] as const) {
      expect(transitionItem({ ...item, status }, "approve")).toEqual({ error: 409 });
    }
  });

  it("declines from needs_ok", () => {
    expect(transitionItem(item, "decline")).toEqual({ next: "declined", followUp: "Declined: Spring offer ad" });
    expect(transitionItem({ ...item, status: "declined" }, "decline")).toEqual({ error: 409 });
  });

  it("change keeps needs_ok and sends the note", () => {
    expect(transitionItem(item, "change", "Shorter headline")).toEqual({ next: "needs_ok", followUp: "Shorter headline" });
    expect(transitionItem({ ...item, status: "live" }, "change", "x")).toEqual({ error: 409 });
  });

  it("a second approve is a 409 with no follow-up", () => {
    const first = transitionItem(item, "approve");
    expect("next" in first && first.next).toBe("done");
    const second = transitionItem({ ...item, status: "done" }, "approve");
    expect(second).toEqual({ error: 409 });
    expect("followUp" in second).toBe(false);
  });

  it("refuses an unknown action", () => {
    expect(transitionItem(item, "ship" as never)).toEqual({ error: 409 });
  });
});

describe("scopeFilter", () => {
  it("reads agency as the null tenant", () => {
    expect(scopeFilter("agency")).toEqual({ column: "tenant_id", op: "is", value: null });
  });
  it("reads a uuid as that tenant", () => {
    expect(scopeFilter(T1)).toEqual({ column: "tenant_id", op: "eq", value: T1 });
  });
  it("parses the query param strictly", () => {
    expect(parseTenantParam("agency")).toBeNull();
    expect(parseTenantParam(T1)).toBe(T1);
    expect(parseTenantParam("willis")).toBeUndefined();
    expect(parseTenantParam(null)).toBeUndefined();
  });
});

function chat(id: string, tenant_id: string | null, agent = "manager", updated_at = "2026-10-17T09:00:00.000Z") {
  return { id, tenant_id, agent, title: id, auto: false, claude_session_id: `s-${id}`, started: true, created_at: updated_at, updated_at };
}

describe("chatSummaries", () => {
  it("agency scope returns only the null-tenant chats", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("agency1", null), chat("willis1", T1)])
      .seed("agent_messages", [
        { id: "m1", chat_id: "agency1", role: "me", body: "Who is behind?\nsecond line", meta: {}, status: "done", created_at: "2026-10-17T09:00:00.000Z" },
        { id: "m2", chat_id: "willis1", role: "me", body: "nope", meta: {}, status: "done", created_at: "2026-10-17T09:00:00.000Z" },
      ]);
    const list = await chatSummaries(db.client(), null, "manager");
    expect(list.map((c) => c.id)).toEqual(["agency1"]);
    expect(list[0]).toMatchObject({ lastLine: "Who is behind?", hasRequest: false, auto: false });
  });

  it("flags a chat with a request still waiting", async () => {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1", T1, "ghl"), chat("c2", T1, "ghl", "2026-10-17T10:00:00.000Z")])
      .seed("agent_items", [
        { id: "i1", tenant_id: T1, agent: "ghl", status: "needs_ok", title: "Put page in funnel" },
        { id: "i2", tenant_id: T1, agent: "ghl", status: "done", title: "Old" },
      ])
      .seed("agent_messages", [
        { id: "r1", chat_id: "c1", role: "request", body: "Put page in funnel", meta: { itemId: "i1", fromAgent: "landing" }, status: "done", created_at: "2026-10-17T09:00:00.000Z" },
        { id: "r2", chat_id: "c2", role: "request", body: "Old", meta: { itemId: "i2", fromAgent: "landing" }, status: "done", created_at: "2026-10-17T10:00:00.000Z" },
      ]);
    const list = await chatSummaries(db.client(), T1, "ghl");
    expect(list.map((c) => [c.id, c.hasRequest])).toEqual([
      ["c2", false],
      ["c1", true],
    ]);
  });
});

describe("upsertItem", () => {
  it("a request from another agent lands as a Request message in that agent's newest chat", async () => {
    const db = new FakeDb().seed("agent_chats", [
      chat("old", T1, "ghl", "2026-10-16T09:00:00.000Z"),
      chat("new", T1, "ghl", "2026-10-17T09:00:00.000Z"),
      chat("agency", null, "ghl", "2026-10-17T11:00:00.000Z"),
    ]);
    const item = await upsertItem(db.client(), {
      tenantId: T1,
      agent: "ghl",
      fromAgent: "landing",
      kind: "request",
      title: "Put the spring page in the funnel",
      status: "needs_ok",
      payload: { body: "Page is live at x", plan: ["Add step"] },
    });
    expect(item).toMatchObject({ agent: "ghl", fromAgent: "landing", chatId: "new", status: "needs_ok" });
    const req = db.rows("agent_messages").find((r) => r.role === "request");
    expect(req).toMatchObject({ chat_id: "new", body: "Page is live at x", meta: { itemId: item.id, fromAgent: "landing" } });
  });

  it("opens a chat for the request when the agent has none", async () => {
    const db = new FakeDb();
    const item = await upsertItem(db.client(), {
      tenantId: T1,
      agent: "ghl",
      fromAgent: "landing",
      kind: "request",
      title: "Funnel step",
      status: "needs_ok",
      payload: {},
    });
    expect(db.rows("agent_chats")).toHaveLength(1);
    expect(db.rows("agent_chats")[0]).toMatchObject({ tenant_id: T1, agent: "ghl", title: "Funnel step" });
    expect(item.chatId).toBe(db.rows("agent_chats")[0].id);
  });

  it("an update with an id rewrites the card and posts no second request", async () => {
    const db = new FakeDb().seed("agent_chats", [chat("c1", T1, "ads")]);
    const first = await upsertItem(db.client(), {
      tenantId: T1, agent: "ads", chatId: "c1", kind: "ad", title: "Ad", status: "building", payload: {},
    });
    const second = await upsertItem(db.client(), {
      id: first.id, tenantId: T1, agent: "ads", chatId: "c1", kind: "ad", title: "Ad v2", status: "needs_ok", payload: { quote: "q" },
    });
    expect(second).toMatchObject({ id: first.id, title: "Ad v2", status: "needs_ok", payload: { quote: "q" } });
    expect(db.rows("agent_items")).toHaveLength(1);
    expect(db.rows("agent_messages")).toHaveLength(0);
  });

  // The id comes from model output, so it can name a card the agent does not own.
  it("refuses to rewrite another client's or another agent's card", async () => {
    const db = new FakeDb().seed("agent_items", [
      { id: "i1", tenant_id: T1, agent: "ads", chat_id: null, title: "Ad", status: "needs_ok", payload: {} },
    ]);
    const other = "00000000-0000-4000-8000-000000000002";
    await expect(
      upsertItem(db.client(), { id: "i1", tenantId: other, agent: "ads", kind: "ad", title: "Hijack", status: "needs_ok", payload: {} }),
    ).rejects.toThrow("item not found");
    await expect(
      upsertItem(db.client(), { id: "i1", tenantId: T1, agent: "ghl", kind: "ad", title: "Hijack", status: "needs_ok", payload: {} }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0]).toMatchObject({ tenant_id: T1, title: "Ad" });
  });

  it("refuses to rewrite another chat's card", async () => {
    const db = new FakeDb().seed("agent_items", [
      { id: "i1", tenant_id: T1, agent: "landing", chat_id: "c1", title: "Page", status: "needs_ok", payload: {} },
    ]);
    await expect(
      upsertItem(db.client(), { id: "i1", tenantId: T1, agent: "landing", chatId: "c2", kind: "page", title: "Hijack", status: "building", payload: {} }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0]).toMatchObject({ chat_id: "c1", title: "Page" });
  });

  it("marks a runner card runnerOwned and refuses the agent's rewrite of it", async () => {
    const db = new FakeDb().seed("agent_chats", [chat("c1", T1, "creative")]);
    const card = await upsertItem(db.client(), {
      tenantId: T1, agent: "creative", chatId: "c1", kind: "creative", title: "Final", status: "needs_ok",
      payload: { path: "t/f1.mp4", grant: { kind: "file" } }, origin: "runner",
    });
    expect(card.payload).toMatchObject({ runnerOwned: true, path: "t/f1.mp4" });
    await expect(
      upsertItem(db.client(), {
        id: card.id, tenantId: T1, agent: "creative", chatId: "c1", kind: "creative", title: "Swapped", status: "needs_ok",
        payload: { path: "t/other.mp4", grant: { kind: "file" } }, origin: "agent",
      }),
    ).rejects.toThrow("item not found");
    // No origin at all is the agent's, never the runner's.
    await expect(
      upsertItem(db.client(), {
        id: card.id, tenantId: T1, agent: "creative", chatId: "c1", kind: "creative", title: "Swapped", status: "needs_ok", payload: {},
      }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0]).toMatchObject({ title: "Final", payload: { path: "t/f1.mp4" } });
    // The runner may still rewrite its own card.
    const again = await upsertItem(db.client(), {
      id: card.id, tenantId: T1, agent: "creative", chatId: "c1", kind: "creative", title: "Final v2", status: "needs_ok",
      payload: { path: "t/f2.mp4" }, origin: "runner",
    });
    expect(again.payload).toMatchObject({ runnerOwned: true, path: "t/f2.mp4" });
  });

  it("never takes runnerOwned from an agent's own payload", async () => {
    const db = new FakeDb().seed("agent_chats", [chat("c1", T1, "ads")]);
    const card = await upsertItem(db.client(), {
      tenantId: T1, agent: "ads", chatId: "c1", kind: "ad", title: "Ad", status: "needs_ok", payload: { runnerOwned: true }, origin: "agent",
    });
    expect(card.payload.runnerOwned).toBeUndefined();
  });

  it("refuses to reopen a card Jake already decided", async () => {
    const db = new FakeDb().seed("agent_items", [
      { id: "i1", tenant_id: T1, agent: "ads", chat_id: null, title: "Ad", status: "done", payload: {} },
    ]);
    await expect(
      upsertItem(db.client(), { id: "i1", tenantId: T1, agent: "ads", kind: "ad", title: "Ad", status: "needs_ok", payload: {} }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0].status).toBe("done");
  });
});

describe("decideItem", () => {
  function setup(status = "needs_ok") {
    return new FakeDb()
      .seed("agent_chats", [chat("c1", T1, "ads")])
      .seed("agent_items", [{ id: "i1", tenant_id: T1, agent: "ads", chat_id: "c1", title: "Ad", status, payload: {}, approved_at: null }]);
  }

  it("approve moves the card and queues one follow-up", async () => {
    const db = setup();
    const res = await decideItem(db.client(), "i1", "approve", undefined, new Date("2026-10-17T12:00:00.000Z"));
    expect("item" in res && res.item.status).toBe("done");
    expect(db.rows("agent_items")[0].approved_at).toBe("2026-10-17T12:00:00.000Z");
    const queued = db.rows("agent_messages").filter((r) => r.status === "queued");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ chat_id: "c1", role: "me", body: "Approved: Ad" });
  });

  // A grant is how an Approve switches on a gated tool for the next turn only
  // (deploy, spend, ghl, file). It rides on the follow-up message, nowhere else.
  function withGrant(grant: unknown) {
    return new FakeDb()
      .seed("agent_chats", [chat("c1", T1, "creative")])
      .seed("agent_items", [
        { id: "i1", tenant_id: T1, agent: "creative", chat_id: "c1", title: "Image", status: "needs_ok", payload: { grant }, approved_at: null },
      ]);
  }

  it("approve carries the card's grant onto the follow-up", async () => {
    const db = withGrant({ kind: "spend", limit: 12 });
    await decideItem(db.client(), "i1", "approve");
    const follow = db.rows("agent_messages").find((r) => r.status === "queued");
    expect(follow?.meta).toEqual({ followUpOf: "i1", grant: { itemId: "i1", kind: "spend", limit: 12 } });
  });

  it("decline and change mark the follow-up but grant nothing", async () => {
    const db = withGrant({ kind: "spend", limit: 12 });
    await decideItem(db.client(), "i1", "decline");
    expect(db.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1" });
    const db2 = withGrant({ kind: "deploy" });
    await decideItem(db2.client(), "i1", "change", "smaller logo");
    expect(db2.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1" });
  });

  it("ignores a grant of an unknown kind and drops a bad limit", async () => {
    const db = withGrant({ kind: "everything", limit: 5 });
    await decideItem(db.client(), "i1", "approve");
    expect(db.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1" });
    const db2 = withGrant({ kind: "spend", limit: "lots" });
    await decideItem(db2.client(), "i1", "approve");
    expect(db2.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1", grant: { itemId: "i1", kind: "spend", limit: null } });
  });

  it("a double approve answers 409 and queues nothing more", async () => {
    const db = setup();
    await decideItem(db.client(), "i1", "approve");
    expect(await decideItem(db.client(), "i1", "approve")).toEqual({ error: 409 });
    expect(db.rows("agent_messages")).toHaveLength(1);
  });

  it("404 for an unknown item", async () => {
    expect(await decideItem(setup().client(), "nope", "approve")).toEqual({ error: 404 });
  });
});

describe("createAutoChat", () => {
  it("opens an Auto chat with the prompt queued", async () => {
    const db = new FakeDb();
    const id = await createAutoChat(db.client(), { tenantId: T1, agent: "ads", title: "Startup check", prompt: "Startup check: CPL up 25%" });
    expect(db.rows("agent_chats")[0]).toMatchObject({ id, auto: true, title: "Startup check", agent: "ads" });
    expect(db.rows("agent_messages")[0]).toMatchObject({ chat_id: id, role: "me", status: "queued", body: "Startup check: CPL up 25%" });
  });
});

describe("runnerStatus", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  it("online when the newest heartbeat is under 90 seconds old", () => {
    expect(runnerStatus([{ last_seen_at: "2026-10-17T11:58:31.000Z" }], now)).toEqual({
      online: true,
      lastSeenAt: "2026-10-17T11:58:31.000Z",
    });
  });
  it("offline at 90 seconds, and with no heartbeat at all", () => {
    expect(runnerStatus([{ last_seen_at: "2026-10-17T11:58:30.000Z" }], now).online).toBe(false);
    expect(runnerStatus([], now)).toEqual({ online: false, lastSeenAt: null });
  });
  it("reads the newest host", () => {
    expect(
      runnerStatus([{ last_seen_at: "2026-10-17T09:00:00.000Z" }, { last_seen_at: "2026-10-17T11:59:00.000Z" }], now),
    ).toEqual({ online: true, lastSeenAt: "2026-10-17T11:59:00.000Z" });
  });
});

describe("lessons for the Brain tab", () => {
  function setup() {
    return new FakeDb()
      .seed("agent_lessons", [
        { id: "l-c1", scope: "client", tenant_id: T1, agent: "ads", text: "a", source: "chat", learned_on: "2026-10-16" },
        { id: "l-c2", scope: "client", tenant_id: "other", agent: "ads", text: "b", source: "chat", learned_on: "2026-10-15" },
        { id: "l-a1", scope: "agent", tenant_id: null, agent: "ads", text: "c", source: "chat", learned_on: "2026-10-14" },
        { id: "l-m1", scope: "manager", tenant_id: null, agent: "manager", text: "d", source: "chat", learned_on: "2026-10-13" },
      ])
      .seed("agent_lesson_edits", [
        { id: "e1", lesson_id: "l-c1", action: "delete", text: null, status: "queued", created_at: "2026-10-17T10:00:00.000Z" },
        { id: "e2", lesson_id: "l-a1", action: "edit", text: "x", status: "applied", created_at: "2026-10-17T09:00:00.000Z" },
      ]);
  }

  it("client scope is that client's brain only", async () => {
    const res = await brainLessons(setup().client(), "client", T1, "ads");
    expect(res.lessons.map((l) => l.id)).toEqual(["l-c1"]);
    expect(res.pendingEditIds).toEqual(["l-c1"]);
  });

  it("agent scope is that agent's brain, mega is everything", async () => {
    expect((await brainLessons(setup().client(), "agent", T1, "ads")).lessons.map((l) => l.id)).toEqual(["l-a1"]);
    expect((await brainLessons(setup().client(), "mega", null, "manager")).lessons).toHaveLength(4);
  });

  it("the agency has no client brain", async () => {
    expect((await brainLessons(setup().client(), "client", null, "manager")).lessons).toEqual([]);
  });

  it("queues an edit for a lesson in the mirror and refuses an unknown one", async () => {
    const db = setup();
    const edit = await queueLessonEdit(db.client(), { lessonId: "l-a1", action: "edit", text: `New text ${EM} here` });
    expect(edit).toMatchObject({ lessonId: "l-a1", action: "edit", text: "New text, here" });
    expect(await queueLessonEdit(db.client(), { lessonId: "l-nope", action: "delete" })).toBeNull();
  });
});
