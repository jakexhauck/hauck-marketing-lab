import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import {
  agentPlaceError,
  chatSummaries,
  createChat,
  ItemInputError,
  createAutoChat,
  decideItem,
  parseTenantParam,
  scopeFilter,
  transitionItem,
  upsertItem,
  runnerStatus,
  brainLessons,
  queueLessonEdit,
  payloadHash,
  listItems,
  postAnswer,
} from "./agentItems";
import { ensureTasks } from "./clientTasks";
import { readPages, savePage } from "./briefPagesStore";
import type { AdsPage } from "../../src/lib/briefPages";

// What the page sends with an Approve: the hash of the payload it drew.
const shown = (db: FakeDb, id = "i1") =>
  payloadHash((db.rows("agent_items").find((r) => r.id === id)?.payload ?? {}) as Record<string, unknown>);

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
        { id: "r1", chat_id: "c1", role: "request", body: "Put page in funnel", meta: { itemId: "i1", fromAgent: "ads" }, status: "done", created_at: "2026-10-17T09:00:00.000Z" },
        { id: "r2", chat_id: "c2", role: "request", body: "Old", meta: { itemId: "i2", fromAgent: "ads" }, status: "done", created_at: "2026-10-17T10:00:00.000Z" },
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
      fromAgent: "ads",
      kind: "request",
      title: "Put the spring page in the funnel",
      status: "needs_ok",
      payload: { body: "Page is live at x", plan: ["Add step"] },
    });
    expect(item).toMatchObject({ agent: "ghl", fromAgent: "ads", chatId: "new", status: "needs_ok" });
    const req = db.rows("agent_messages").find((r) => r.role === "request");
    expect(req).toMatchObject({ chat_id: "new", body: "Page is live at x", meta: { itemId: item.id, fromAgent: "ads" } });
  });

  it("opens a chat for the request when the agent has none", async () => {
    const db = new FakeDb();
    const item = await upsertItem(db.client(), {
      tenantId: T1,
      agent: "ghl",
      fromAgent: "ads",
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
      { id: "i1", tenant_id: T1, agent: "ads", chat_id: "c1", title: "Page", status: "needs_ok", payload: {} },
    ]);
    await expect(
      upsertItem(db.client(), { id: "i1", tenantId: T1, agent: "ads", chatId: "c2", kind: "page", title: "Hijack", status: "building", payload: {} }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0]).toMatchObject({ chat_id: "c1", title: "Page" });
  });

  it("marks a runner card runnerOwned and refuses the agent's rewrite of it", async () => {
    const db = new FakeDb().seed("agent_chats", [chat("c1", T1, "ads")]);
    const card = await upsertItem(db.client(), {
      tenantId: T1, agent: "ads", chatId: "c1", kind: "creative", title: "Final", status: "needs_ok",
      payload: { path: "t/f1.mp4", grant: { kind: "file" } }, origin: "runner",
    });
    expect(card.payload).toMatchObject({ runnerOwned: true, path: "t/f1.mp4" });
    await expect(
      upsertItem(db.client(), {
        id: card.id, tenantId: T1, agent: "ads", chatId: "c1", kind: "creative", title: "Swapped", status: "needs_ok",
        payload: { path: "t/other.mp4", grant: { kind: "file" } }, origin: "agent",
      }),
    ).rejects.toThrow("item not found");
    // No origin at all is the agent's, never the runner's.
    await expect(
      upsertItem(db.client(), {
        id: card.id, tenantId: T1, agent: "ads", chatId: "c1", kind: "creative", title: "Swapped", status: "needs_ok", payload: {},
      }),
    ).rejects.toThrow("item not found");
    expect(db.rows("agent_items")[0]).toMatchObject({ title: "Final", payload: { path: "t/f1.mp4" } });
    // The runner may still rewrite its own card.
    const again = await upsertItem(db.client(), {
      id: card.id, tenantId: T1, agent: "ads", chatId: "c1", kind: "creative", title: "Final v2", status: "needs_ok",
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

describe("decideItem, the Manager's tasks card", () => {
  const ops = [
    { op: "cut", key: "follow:job-reminders", reason: "No jobs in GHL" },
    { op: "add", phase: "ghl", owner: "client", name: "Ask: who answers the phone", reason: "Not on the intake" },
    { op: "cut", key: "nope:gone", reason: "x" },
  ];
  function card(agent = "csm", taskOps: unknown = ops) {
    return new FakeDb()
      .seed("agent_chats", [chat("c1", T1, agent)])
      .seed("agent_items", [{ id: "i1", tenant_id: T1, agent, chat_id: "c1", kind: "tasks", title: "Kickoff tasks", status: "needs_ok", payload: { taskOps }, approved_at: null }]);
  }

  it("approve applies the ops, reports the ones it could not, and says so in the follow-up", async () => {
    const db = card();
    const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    const tasks = db.rows("client_tasks");
    expect(tasks.find((r) => r.key === "follow:job-reminders")).toMatchObject({ state: "cut", reason: "No jobs in GHL" });
    expect(tasks.find((r) => r.key === "added:ask-who-answers-the-phone")).toMatchObject({ owner: "client", change: "added" });
    const follow = db.rows("agent_messages").find((r) => r.status === "queued")!;
    expect(follow.body).toBe("Approved: Kickoff tasks\nTasks applied: 2. Not applied: nope:gone (no task with that key).");
  });

  // A client whose client_tasks table fails: on insert only, or on every call.
  function failing(db: FakeDb, mode: "insert" | "all") {
    const base = db.client();
    const broken = { message: "boom" };
    return {
      from(table: string) {
        const q = base.from(table) as unknown as Record<string, unknown>;
        if (table !== "client_tasks") return q;
        if (mode === "insert") {
          q.insert = () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: broken }) }) });
          return q;
        }
        const dead: Record<string, unknown> = {};
        for (const m of ["select", "eq", "insert", "update", "upsert", "delete", "maybeSingle", "order"]) dead[m] = () => dead;
        dead.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: broken }).then(ok);
        return dead;
      },
    } as unknown as ReturnType<FakeDb["client"]>;
  }

  it("a failing add is reported and the other ops still apply", async () => {
    const db = card();
    await ensureTasks(db.client(), T1);
    const res = await decideItem(failing(db, "insert"), "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    expect(db.rows("client_tasks").find((r) => r.key === "follow:job-reminders")).toMatchObject({ state: "cut" });
    const follow = db.rows("agent_messages").find((r) => r.status === "queued")!;
    expect(follow.body).toContain("Tasks applied: 1.");
    expect(follow.body).toContain("Ask: who answers the phone (client_tasks insert: boom)");
  });

  it("a Director that cannot be read still finishes the Approve and says nothing applied", async () => {
    const db = card();
    const res = await decideItem(failing(db, "all"), "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    const follow = db.rows("agent_messages").find((r) => r.status === "queued")!;
    expect(follow.body).toMatch(/^Approved: Kickoff tasks\nTasks not applied: /);
  });

  it("a bad tasks payload is refused and the card stays waiting", async () => {
    const db = card("csm", [{ op: "add", reason: "x" }]);
    const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect(res).toMatchObject({ error: 422 });
    expect(db.rows("agent_items")[0].status).toBe("needs_ok");
    expect(db.rows("client_tasks")).toHaveLength(0);
  });

  it("the same card from any other agent changes no tasks", async () => {
    const db = card("ghl");
    await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect(db.rows("client_tasks")).toHaveLength(0);
  });

  it("decline applies nothing", async () => {
    const db = card();
    await decideItem(db.client(), "i1", "decline");
    expect(db.rows("client_tasks")).toHaveLength(0);
  });
});

describe("decideItem, a brief card", () => {
  const ops = [
    { op: "set", field: "offer", value: "Free inspection + $500 off" },
    { op: "add", kind: "angle", fields: { name: "Drafty in winter", pitch: "The cold room" } },
  ];
  async function card(agent = "ads", pageOps: unknown = ops) {
    const db = new FakeDb()
      .seed("agent_chats", [chat("c1", T1, agent)])
      .seed("agent_items", [{ id: "i1", tenant_id: T1, agent, chat_id: "c1", kind: "brief", title: "Offer and angle", status: "needs_ok", payload: { plan: ["Lead with the inspection"], pageOps }, approved_at: null }]);
    await savePage(db.client(), { tenantId: T1, page: "ads", data: { campaigns: [{ name: "Winter Leads", offer: "Free quote" }] }, version: 0, by: "ads" });
    return db;
  }
  const adsPage = async (db: FakeDb) => (await readPages(db.client(), T1))[1];

  it("approve writes the ops to the agent's page and tells the agent what landed", async () => {
    const db = await card();
    const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    const page = await adsPage(db);
    expect(page).toMatchObject({ version: 2, updatedBy: "ads" });
    expect((page.data as AdsPage).campaigns[0]).toMatchObject({ offer: "Free inspection + $500 off", angles: [{ name: "Drafty in winter", status: "approved" }] });
    const follow = db.rows("agent_messages").find((r) => r.status === "queued")!;
    expect(follow.body).toBe("Approved: Offer and angle\nBrief updated: Set offer: Free inspection + $500 off; Add angle: Drafty in winter.");
  });

  it("a page written in between is read again and the ops still land once", async () => {
    const db = await card();
    // Another writer bumps the page between the read and the first save.
    const base = db.client();
    let bumped = false;
    const racing = {
      from(table: string) {
        const q = base.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
        if (table !== "client_brief_pages" || bumped) return q;
        const update = q.update.bind(q);
        q.update = (patch: unknown) => {
          bumped = true;
          const row = db.rows("client_brief_pages")[0];
          row.version = 2;
          row.data = { campaigns: [{ name: "Winter Leads", offer: "Free quote", objective: "Leads" }] };
          return update(patch);
        };
        return q;
      },
    } as unknown as ReturnType<FakeDb["client"]>;
    const res = await decideItem(racing, "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    const page = await adsPage(db);
    expect(page.version).toBe(3);
    expect((page.data as AdsPage).campaigns[0]).toMatchObject({ objective: "Leads", offer: "Free inspection + $500 off" });
    expect((page.data as AdsPage).campaigns[0].angles).toHaveLength(1);
  });

  it("ops that miss on the page leave it alone and the follow-up says why", async () => {
    const db = await card("ads", [{ op: "set", campaign: "Summer", field: "offer", value: "x" }]);
    const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    expect((await adsPage(db)).version).toBe(1);
    const follow = db.rows("agent_messages").find((r) => r.status === "queued")!;
    expect(follow.body).toBe("Approved: Offer and angle\nBrief not updated: op 1: no campaign named Summer.");
  });

  it("a malformed card is refused and stays waiting", async () => {
    const db = await card("ads", [{ op: "add", kind: "banner", fields: { name: "x" } }]);
    const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect(res).toMatchObject({ error: 422 });
    expect(db.rows("agent_items")[0].status).toBe("needs_ok");
    expect(db.rows("agent_messages")).toHaveLength(0);
  });

  it("from an agent with no page, or on decline, the page is untouched", async () => {
    const ghl = await card("ghl");
    await decideItem(ghl.client(), "i1", "approve", undefined, undefined, await shown(ghl));
    expect((await adsPage(ghl)).version).toBe(1);
    const declined = await card();
    await decideItem(declined.client(), "i1", "decline");
    expect((await adsPage(declined)).version).toBe(1);
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
    const res = await decideItem(db.client(), "i1", "approve", undefined, new Date("2026-10-17T12:00:00.000Z"), await shown(db));
    expect("item" in res && res.item.status).toBe("done");
    expect(db.rows("agent_items")[0].approved_at).toBe("2026-10-17T12:00:00.000Z");
    const queued = db.rows("agent_messages").filter((r) => r.status === "queued");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ chat_id: "c1", role: "me", body: "Approved: Ad" });
  });

  // A grant is how an Approve switches on a gated tool for the next turn only
  // (deploy, spend, ghl, file). It rides on the follow-up message, nowhere else.
  function withGrant(grant: unknown, extra: Record<string, unknown> = {}) {
    return new FakeDb()
      .seed("agent_chats", [chat("c1", T1, "ads")])
      .seed("agent_items", [
        { id: "i1", tenant_id: T1, agent: "ads", chat_id: "c1", title: "Image", status: "needs_ok", payload: { grant, ...extra }, approved_at: null },
      ]);
  }

  it("approve carries the card's grant onto the follow-up", async () => {
    const db = withGrant({ kind: "spend", limit: 12 });
    await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
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
    await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect(db.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1" });
    // A spend with no usable number was never a price Jake saw: no grant.
    for (const limit of ["lots", null, 0, -5, 2.5]) {
      const db2 = withGrant({ kind: "spend", limit });
      await decideItem(db2.client(), "i1", "approve", undefined, undefined, await shown(db2));
      expect(db2.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1" });
    }
    // Other kinds carry no limit and still grant.
    const db3 = withGrant({ kind: "ghl" });
    await decideItem(db3.client(), "i1", "approve", undefined, undefined, await shown(db3));
    expect(db3.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1", grant: { itemId: "i1", kind: "ghl", limit: null } });
    // The Ads Agent's Meta changes (Phase 7) grant the same way.
    const db4 = withGrant({ kind: "meta" });
    await decideItem(db4.client(), "i1", "approve", undefined, undefined, await shown(db4));
    expect(db4.rows("agent_messages")[0].meta).toEqual({ followUpOf: "i1", grant: { itemId: "i1", kind: "meta", limit: null } });
  });

  it("grants deploy and file only on a card the runner made", async () => {
    for (const kind of ["deploy", "file"]) {
      const own = withGrant({ kind }, { runnerOwned: true });
      await decideItem(own.client(), "i1", "approve", undefined, undefined, await shown(own));
      expect(own.rows("agent_messages")[0].meta, kind).toEqual({ followUpOf: "i1", grant: { itemId: "i1", kind, limit: null } });
      const forged = withGrant({ kind });
      await decideItem(forged.client(), "i1", "approve", undefined, undefined, await shown(forged));
      expect(forged.rows("agent_messages")[0].meta, kind).toEqual({ followUpOf: "i1" });
    }
  });

  it("a double approve answers 409 and queues nothing more", async () => {
    const db = setup();
    await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
    expect(await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db))).toEqual({ error: 409 });
    expect(db.rows("agent_messages")).toHaveLength(1);
  });

  it("lists each card with the hash of its payload", async () => {
    const db = setup();
    const [item] = await listItems(db.client(), T1, null);
    expect(item.payloadHash).toBe(await payloadHash({}));
    expect(await payloadHash({ a: 1, b: { c: 2, d: 3 } })).toBe(await payloadHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(await payloadHash({ a: 1 })).not.toBe(await payloadHash({ a: 2 }));
  });

  // A card can be rewritten while it waits (a landing redraft, new GHL ops).
  // Approve is for what Jake saw, so a rewrite in between is a 409.
  it("refuses an Approve of a card rewritten after Jake saw it", async () => {
    const ghl = { grant: { kind: "ghl" }, ops: [{ op: "write.customValue", args: { key: "Winter Page", value: "https://a" } }] };
    const landing = { site: "winter", previewUrl: "https://d-1.hm-a.pages.dev", grant: { kind: "deploy" }, runnerOwned: true };
    for (const [agent, before, after, origin] of [
      ["ghl", ghl, { ...ghl, ops: [{ op: "write.customValue", args: { key: "Winter Page", value: "https://evil" } }] }, "agent"],
      ["ads", landing, { ...landing, previewUrl: "https://d-2.hm-a.pages.dev" }, "runner"],
    ] as const) {
      const db = new FakeDb()
        .seed("agent_chats", [chat("c1", T1, agent)])
        .seed("agent_items", [{ id: "i1", tenant_id: T1, agent, chat_id: "c1", kind: "k", title: "Card", status: "needs_ok", payload: before, approved_at: null }]);
      const seen = await shown(db);
      await upsertItem(db.client(), { id: "i1", tenantId: T1, agent, chatId: "c1", kind: "k", title: "Card", status: "needs_ok", payload: after, origin });
      expect(await decideItem(db.client(), "i1", "approve", undefined, undefined, seen), agent).toEqual({ error: 409, changed: true });
      expect(db.rows("agent_items")[0].status).toBe("needs_ok");
      expect(db.rows("agent_messages")).toEqual([]);
      // Looked at again, it goes through.
      const res = await decideItem(db.client(), "i1", "approve", undefined, undefined, await shown(db));
      expect("item" in res && res.item.status, agent).toBe("done");
    }
  });

  it("refuses an Approve that names no payload", async () => {
    const db = setup();
    expect(await decideItem(db.client(), "i1", "approve")).toEqual({ error: 409, changed: true });
    // Decline and Change it act on no payload, so they need none.
    expect("item" in (await decideItem(db.client(), "i1", "decline"))).toBe(true);
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

describe("where an agent works", () => {
  it("keeps the agency to the Manager and the Manager to the agency", () => {
    expect(agentPlaceError(null, "manager")).toBeNull();
    expect(agentPlaceError(T1, "csm")).toBeNull();
    expect(agentPlaceError(null, "csm")).toBe("only the Manager works at the agency");
    expect(agentPlaceError(T1, "manager")).toBe("the Manager works at the agency only");
  });

  it("refuses a client Manager chat or card before the database does", async () => {
    await expect(createChat(new FakeDb().client(), { tenantId: T1, agent: "manager" })).rejects.toThrow(ItemInputError);
    await expect(createAutoChat(new FakeDb().client(), { tenantId: null, agent: "csm", title: "x", prompt: "y" })).rejects.toThrow("only the Manager works at the agency");
    await expect(createAutoChat(new FakeDb().client(), { tenantId: T1, agent: "manager", title: "x", prompt: "y" })).rejects.toThrow("the Manager works at the agency only");
    await expect(
      upsertItem(new FakeDb().client(), { tenantId: T1, agent: "manager", kind: "k", title: "t", status: "needs_ok", payload: {} }),
    ).rejects.toThrow(ItemInputError);
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

describe("postAnswer", () => {
  // Research answered Ads: the request card sits with Research, the follow-up
  // Jake's Approve queued is running in Research's chat, and Ads asked from a1.
  function setup(over: { status?: string; payload?: Record<string, unknown>; asker?: Record<string, unknown> } = {}) {
    return new FakeDb()
      .seed("agent_chats", [chat("r1", T1, "research"), { ...chat("a1", T1, "ads"), ...over.asker }])
      .seed("agent_items", [
        {
          id: "req1",
          tenant_id: T1,
          agent: "research",
          from_agent: "ads",
          chat_id: "r1",
          kind: "request",
          title: "Customer words",
          status: over.status ?? "done",
          payload: over.payload ?? { body: "What words?", fromChatId: "a1" },
          approved_at: "2026-10-18T09:00:00.000Z",
        },
      ])
      .seed("agent_messages", [
        { id: "f1", chat_id: "r1", role: "me", body: "Approved: Customer words", status: "running", meta: { followUpOf: "req1" } },
      ]);
  }

  it("queues the answer once in the asking agent's chat, as a request message, never as Jake", async () => {
    const db = setup();
    expect(await postAnswer(db.client(), { messageId: "f1", body: `Drafty ${EM} cold rooms` })).toEqual({ posted: true });
    expect(await postAnswer(db.client(), { messageId: "f1", body: "again" })).toEqual({ posted: false });
    const answers = db.rows("agent_messages").filter((r) => r.chat_id === "a1");
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      role: "request",
      status: "queued",
      body: "Drafty, cold rooms",
      meta: { fromAgent: "research", answerOf: "req1" },
    });
  });

  it("posts nothing for a request Jake declined or has not decided", async () => {
    for (const status of ["declined", "needs_ok"]) {
      const db = setup({ status });
      expect(await postAnswer(db.client(), { messageId: "f1", body: "x" })).toEqual({ posted: false });
      expect(db.rows("agent_messages").filter((r) => r.chat_id === "a1")).toHaveLength(0);
    }
  });

  it("404s when the message is not a running follow-up of a request, or the asking chat is wrong or gone", async () => {
    const cases = [
      setup({ payload: { body: "x" } }),
      setup({ payload: { body: "x", fromChatId: "missing" } }),
      setup({ asker: { agent: "ghl" } }),
      setup({ asker: { tenant_id: null } }),
    ];
    for (const db of cases) expect(await postAnswer(db.client(), { messageId: "f1", body: "x" })).toEqual({ error: 404 });
    const notRequest = setup();
    notRequest.rows("agent_items")[0].kind = "ad_plan";
    expect(await postAnswer(notRequest.client(), { messageId: "f1", body: "x" })).toEqual({ error: 404 });
    const done = setup();
    done.rows("agent_messages")[0].status = "done";
    expect(await postAnswer(done.client(), { messageId: "f1", body: "x" })).toEqual({ error: 404 });
    expect(await postAnswer(setup().client(), { messageId: "f1", body: "  " })).toEqual({ error: 400 });
  });
});
