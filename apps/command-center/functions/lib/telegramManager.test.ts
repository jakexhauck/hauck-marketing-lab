import { describe, it, expect, beforeEach } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { itemFromRow, payloadHash } from "./agentItems";
import { approveData, changeData, type Keyboard, type SendOptions, type TelegramApi } from "./telegram";
import {
  checkRunnerOffline,
  handleUpdate,
  notifyItem,
  syncDecision,
  trackTurn,
} from "./telegramManager";
import type { Env } from "./env";

const ID = "0f3a2b1c-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const JAKE = "555";

const env = { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: JAKE, TELEGRAM_WEBHOOK_SECRET: "sec" } as unknown as Env;

// Records every call and hands out increasing message ids, like Telegram.
class FakeApi implements TelegramApi {
  sent: { chatId: string; text: string; opts?: SendOptions }[] = [];
  edits: { chatId: string; messageId: number; text: string; keyboard?: Keyboard }[] = [];
  answers: { id: string; text?: string; alert?: boolean }[] = [];
  private next = 100;
  async sendMessage(chatId: string, text: string, opts?: SendOptions) {
    this.sent.push({ chatId, text, opts });
    this.next += 1;
    return { message_id: this.next };
  }
  async editMessageText(chatId: string, messageId: number, text: string, keyboard?: Keyboard) {
    this.edits.push({ chatId, messageId, text, keyboard });
  }
  async answerCallbackQuery(id: string, text?: string, alert?: boolean) {
    this.answers.push({ id, text, alert });
  }
}

let db: FakeDb;
let api: FakeApi;

function seedItem(over: Record<string, unknown> = {}) {
  db.seed("agent_items", [
    {
      id: ID,
      tenant_id: T1,
      agent: "ads",
      chat_id: "c1",
      from_agent: null,
      kind: "work",
      title: "Spring offer ad",
      status: "needs_ok",
      payload: { plan: ["New ad set"] },
      approved_at: null,
      updated_at: "2026-10-22T11:00:00.000Z",
      ...over,
    },
  ]);
}

const item = () => itemFromRow(db.rows("agent_items").find((r) => r.id === ID)!);
const client = () => db.client();

beforeEach(() => {
  db = new FakeDb();
  db.seed("tenants", [{ id: T1, name: "Clear Choice Windows" }]);
  db.seed("agent_chats", [{ id: "c1", tenant_id: T1, agent: "ads", title: "Ads" }]);
  api = new FakeApi();
});

describe("notifyItem", () => {
  it("does nothing while Telegram is not set up", async () => {
    seedItem();
    expect(await notifyItem({} as Env, client(), item(), { api })).toBe("skipped");
    expect(api.sent).toHaveLength(0);
  });

  it("sends a waiting card once, and not again for an unchanged rewrite", async () => {
    seedItem();
    expect(await notifyItem(env, client(), item(), { api })).toBe("sent");
    expect(api.sent[0].chatId).toBe(JAKE);
    expect(api.sent[0].text).toContain("Ads Agent, Clear Choice Windows");
    expect(await notifyItem(env, client(), item(), { api })).toBe("unchanged");
    expect(api.sent).toHaveLength(1);
    expect(db.rows("telegram_messages")).toHaveLength(1);
  });

  it("a changed payload replaces the old message", async () => {
    seedItem();
    await notifyItem(env, client(), item(), { api });
    db.rows("agent_items")[0].payload = { plan: ["New ad set", "Higher budget"] };
    expect(await notifyItem(env, client(), item(), { api })).toBe("sent");
    expect(api.edits[0]).toMatchObject({ messageId: 101, text: "Spring offer ad\n\nReplaced by a newer version." });
    expect(api.sent).toHaveLength(2);
    expect(db.rows("telegram_messages").map((r) => r.state)).toEqual(["closed", "open"]);
  });

  it("a building card sends nothing", async () => {
    seedItem({ status: "building" });
    expect(await notifyItem(env, client(), item(), { api })).toBe("skipped");
    expect(api.sent).toHaveLength(0);
  });
});

describe("syncDecision", () => {
  it("edits the open message when Jake decides in the app", async () => {
    seedItem();
    await notifyItem(env, client(), item(), { api });
    await syncDecision(env, client(), item(), "approve", "", { api });
    expect(api.edits).toEqual([{ chatId: JAKE, messageId: 101, text: "Spring offer ad\n\nApproved in the app.", keyboard: undefined }]);
    expect(db.rows("telegram_messages")[0].state).toBe("closed");
  });
});

describe("handleUpdate", () => {
  const tap = (data: string, chat = JAKE) => ({
    callback_query: { id: "cb1", data, message: { message_id: 101, chat: { id: Number(chat) } } },
  });

  it("approves with the current hash and edits the message", async () => {
    seedItem();
    await notifyItem(env, client(), item(), { api });
    const hash = await payloadHash(item().payload);
    expect(await handleUpdate(env, client(), tap(approveData(ID, hash)), api)).toBe("approved");
    expect(item().status).toBe("done");
    expect(api.answers[0]).toMatchObject({ id: "cb1", text: "Approved." });
    expect(api.edits[0].text).toBe("Spring offer ad\n\nApproved in Telegram.");
    // The agent got its follow-up, the same as an Approve in the app.
    expect(db.rows("agent_messages").some((m) => m.body === "Approved: Spring offer ad")).toBe(true);
  });

  it("checks the full hash this message was sent with, not only the button's prefix", async () => {
    seedItem();
    await notifyItem(env, client(), item(), { api });
    const shown = await payloadHash(item().payload);
    // The card is rewritten with no new message, and the stored hash is made to
    // share the button's prefix: only the full hash can tell them apart.
    db.rows("agent_items")[0].payload = { plan: ["Something else"] };
    db.rows("telegram_messages")[0].payload_hash = shown.slice(0, 8) + "0".repeat(shown.length - 8);
    expect(await handleUpdate(env, client(), tap(approveData(ID, shown)), api)).toBe("refused");
    expect(item().status).toBe("needs_ok");
  });

  it("refuses an Approve on a message it never sent", async () => {
    seedItem();
    const hash = await payloadHash(item().payload);
    expect(await handleUpdate(env, client(), tap(approveData(ID, hash)), api)).toBe("stale");
    expect(item().status).toBe("needs_ok");
  });

  it("refuses a stale hash and leaves the card waiting", async () => {
    seedItem();
    const old = await payloadHash(item().payload);
    db.rows("agent_items")[0].payload = { plan: ["Something else"] };
    expect(await handleUpdate(env, client(), tap(approveData(ID, old)), api)).toBe("stale");
    expect(item().status).toBe("needs_ok");
    expect(api.answers[0]).toEqual({ id: "cb1", text: "Card changed, open the app.", alert: true });
    expect(db.rows("agent_messages")).toHaveLength(0);
  });

  it("ignores taps and messages from any other chat", async () => {
    seedItem();
    const hash = await payloadHash(item().payload);
    expect(await handleUpdate(env, client(), tap(approveData(ID, hash), "999"), api)).toBe("ignored");
    expect(await handleUpdate(env, client(), { message: { message_id: 1, chat: { id: 999 }, text: "/start" } }, api)).toBe("ignored");
    expect(item().status).toBe("needs_ok");
    expect(api.answers).toHaveLength(0);
    expect(api.sent).toHaveLength(0);
  });

  it("Change asks for the note, and the reply sends it to the agent", async () => {
    seedItem();
    await notifyItem(env, client(), item(), { api });
    expect(await handleUpdate(env, client(), tap(changeData(ID)), api)).toBe("change-prompted");
    const prompt = api.sent[1];
    expect(prompt.opts?.forceReply).toBe(true);
    expect(prompt.text).toBe("What should change? Spring offer ad");

    const reply = { message: { message_id: 300, chat: { id: Number(JAKE) }, text: "Make it $20 a day", reply_to_message: { message_id: 102 } } };
    expect(await handleUpdate(env, client(), reply, api)).toBe("changed");
    expect(item().status).toBe("needs_ok");
    expect(db.rows("agent_messages").some((m) => m.body === "Make it $20 a day" && m.role === "me")).toBe(true);
    expect(api.sent[2].text).toBe("Sent to the Ads Agent.");
    expect(api.edits[0].text).toBe("Spring offer ad\n\nChange asked in Telegram: Make it $20 a day");
    // A second reply to the same prompt does nothing.
    expect(await handleUpdate(env, client(), reply, api)).toBe("ignored");
  });

  it("a plain message that is not a reply does nothing", async () => {
    expect(await handleUpdate(env, client(), { message: { message_id: 1, chat: { id: Number(JAKE) }, text: "hello" } }, api)).toBe("ignored");
    expect(api.sent).toHaveLength(0);
  });

  it("before the chat id is set, /start answers with it and nothing else works", async () => {
    const setup = { ...env, TELEGRAM_CHAT_ID: undefined } as Env;
    expect(await handleUpdate(setup, client(), { message: { message_id: 1, chat: { id: 4242 }, text: "/start" } }, api)).toBe("setup");
    expect(api.sent[0]).toMatchObject({ chatId: "4242", text: "Your chat id is 4242. Set TELEGRAM_CHAT_ID to it." });
    seedItem();
    const hash = await payloadHash(item().payload);
    expect(await handleUpdate(setup, client(), tap(approveData(ID, hash)), api)).toBe("ignored");
    expect(item().status).toBe("needs_ok");
  });
});

describe("alerts", () => {
  it("runner offline over 10 minutes alerts once, then clears", async () => {
    db.seed("agent_runner_state", [{ host: "vps", last_seen_at: "2026-10-22T12:00:00.000Z" }]);
    const at = (iso: string) => ({ api, now: new Date(iso) });
    expect(await checkRunnerOffline(env, client(), at("2026-10-22T12:09:00.000Z"))).toBe("ok");
    expect(await checkRunnerOffline(env, client(), at("2026-10-22T12:20:00.000Z"))).toBe("alerted");
    expect(api.sent[0].text).toContain("No heartbeat for 20 minutes");
    expect(await checkRunnerOffline(env, client(), at("2026-10-22T12:50:00.000Z"))).toBe("ok");
    expect(api.sent).toHaveLength(1);
    db.rows("agent_runner_state")[0].last_seen_at = "2026-10-22T12:59:30.000Z";
    expect(await checkRunnerOffline(env, client(), at("2026-10-22T13:00:00.000Z"))).toBe("cleared");
    expect(api.sent).toHaveLength(1);
  });

  it("watches the VPS runner: the PC being up does not hide the VPS down", async () => {
    db.seed("agent_runner_state", [
      { host: "hauck-vps", last_seen_at: "2026-10-22T12:00:00.000Z" },
      { host: "JAKE-PC", last_seen_at: "2026-10-22T12:19:50.000Z" },
    ]);
    expect(await checkRunnerOffline(env, client(), { api, now: new Date("2026-10-22T12:20:00.000Z") })).toBe("alerted");
  });

  it("two failed turns in a row for one agent alert once; a good turn resets", async () => {
    db.seed("agent_messages", ["m1", "m2", "m3", "m4"].map((id) => ({ id, chat_id: "c1", role: "me" })));
    const turn = (messageId: string, status: "done" | "error") => trackTurn(env, client(), { messageId, status, error: "Hermes 500" }, { api });
    expect(await turn("m1", "error")).toBe("counted");
    expect(await turn("m1", "error")).toBe("ok");
    expect(api.sent).toHaveLength(0);
    expect(await turn("m2", "error")).toBe("alerted");
    expect(api.sent[0].text).toContain("Ads Agent at Clear Choice Windows failed 2 turns in a row");
    expect(await turn("m3", "error")).toBe("counted");
    expect(api.sent).toHaveLength(1);
    expect(await turn("m4", "done")).toBe("reset");
    expect(db.rows("telegram_alerts")[0]).toMatchObject({ key: "turn:ads", fails: 0, alerted_at: null });
  });
});
