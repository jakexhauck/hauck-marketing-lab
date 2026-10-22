import { describe, it, expect, vi } from "vitest";
import type { AgentItem } from "../../src/lib/agentWire";
import {
  alertMessage,
  approvalMessage,
  approveData,
  changeData,
  chatLink,
  parseCallback,
  telegramApi,
  telegramConfig,
  webhookSecretMatches,
} from "./telegram";
import type { Env } from "./env";

const ID = "0f3a2b1c-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
const HASH = "abcdef0123456789".repeat(4);
const EM = String.fromCharCode(0x2014);

function card(over: Partial<AgentItem> = {}): AgentItem {
  return {
    id: ID,
    tenantId: T1,
    agent: "ads",
    chatId: "c1",
    fromAgent: null,
    kind: "work",
    title: "Spring offer ad",
    status: "needs_ok",
    payload: { plan: ["New ad set at $30 a day", "Two creatives"] },
    approvedAt: null,
    updatedAt: "2026-10-22T12:00:00Z",
    ...over,
  };
}

describe("callback data", () => {
  it("fits Telegram's 64 bytes and parses back", () => {
    const a = approveData(ID, HASH);
    expect(new TextEncoder().encode(a).length).toBeLessThanOrEqual(64);
    expect(parseCallback(a)).toEqual({ action: "approve", itemId: ID, hashPrefix: "abcdef01" });
    expect(parseCallback(changeData(ID))).toEqual({ action: "change", itemId: ID });
  });

  it("refuses anything else", () => {
    for (const bad of [undefined, 42, "", "a:not-a-uuid:abcdef01", `a:${ID}`, `a:${ID}:xyz`, `x:${ID}`, `c:${ID}:extra`]) {
      expect(parseCallback(bad)).toBeNull();
    }
  });
});

describe("approvalMessage", () => {
  it("names the card, the agent and the client, and lists the plan", () => {
    const { text, keyboard } = approvalMessage(card(), { hash: HASH, clientName: "Clear Choice Windows" });
    expect(text.split("\n")[0]).toBe("Spring offer ad");
    expect(text).toContain("Ads Agent, Clear Choice Windows");
    expect(text).toContain("- New ad set at $30 a day");
    expect(keyboard[0].map((b) => b.text)).toEqual(["Approve", "Change"]);
    expect(keyboard[0][0]).toEqual({ text: "Approve", callback_data: approveData(ID, HASH) });
    expect(keyboard[1][0]).toEqual({
      text: "Open",
      url: `https://app.hauckmarketing.com/admin/client/${T1}/agent/ads?chat=c1`,
    });
  });

  it("says a request is one, with the ask", () => {
    const { text } = approvalMessage(
      card({ kind: "request", fromAgent: "research", payload: { body: "Pull the top 3 competitors", plan: [] } }),
      { hash: HASH },
    );
    expect(text).toContain("Request from Market Research Agent to Ads Agent");
    expect(text).toContain("Pull the top 3 competitors");
  });

  it("caps long plans, falls back to the quote and strips em dashes", () => {
    const many = approvalMessage(card({ payload: { plan: Array.from({ length: 12 }, (_, i) => `Step ${i}`) } }), { hash: HASH });
    expect(many.text).toContain("- Step 7");
    expect(many.text).not.toContain("- Step 8");
    expect(many.text).toContain("and 4 more in the app");
    const quote = approvalMessage(card({ title: `Hook ${EM} v2`, payload: { quote: `Cold house ${EM} fixed today` } }), { hash: HASH });
    expect(quote.text).toContain("Cold house");
    expect(quote.text).not.toContain(EM);
  });

  it("shows what a spend or a deploy would do", () => {
    const { text } = approvalMessage(
      card({ payload: { grant: { kind: "spend", limit: 40 }, previewUrl: "https://x.pages.dev" } }),
      { hash: HASH },
    );
    expect(text).toContain("Spends up to 40 credits.");
    expect(text).toContain("Preview: https://x.pages.dev");
  });

  it("links the agency Manager without a client path", () => {
    expect(chatLink({ tenantId: null, agent: "manager", chatId: null })).toBe("https://app.hauckmarketing.com/admin/agents/manager");
  });
});

describe("alertMessage", () => {
  it("heads each kind plainly", () => {
    expect(alertMessage("runner_offline", "No heartbeat for 12 minutes.")).toBe("Agent runner offline\n\nNo heartbeat for 12 minutes.");
    expect(alertMessage("turn_errors", "x").startsWith("Agent turns failing")).toBe(true);
  });
});

describe("webhookSecretMatches / telegramConfig", () => {
  it("needs the exact secret", () => {
    expect(webhookSecretMatches("s3cret-value", "s3cret-value")).toBe(true);
    expect(webhookSecretMatches("s3cret-valuX", "s3cret-value")).toBe(false);
    expect(webhookSecretMatches("s3cret", "s3cret-value")).toBe(false);
    expect(webhookSecretMatches(null, "s3cret-value")).toBe(false);
    expect(webhookSecretMatches("", "")).toBe(false);
  });

  it("is off unless all three vars are set", () => {
    const full = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1", TELEGRAM_WEBHOOK_SECRET: "s" } as unknown as Env;
    expect(telegramConfig(full)).toEqual({ token: "t", chatId: "1", secret: "s" });
    expect(telegramConfig({ ...full, TELEGRAM_CHAT_ID: " " } as Env)).toBeNull();
  });
});

describe("telegramApi", () => {
  it("posts JSON to the method and returns the result", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, result: { message_id: 7 } }));
    const api = telegramApi("TOKEN", fetchImpl as unknown as typeof fetch);
    const sent = await api.sendMessage("99", "hi", { keyboard: [[{ text: "A", callback_data: "x" }]] });
    expect(sent.message_id).toBe(7);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "99", text: "hi", reply_markup: { inline_keyboard: [[{ text: "A", callback_data: "x" }]] } });
  });

  it("sends a force reply and ignores 'not modified' on edit", async () => {
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string));
      return calls.length === 1
        ? Response.json({ ok: true, result: { message_id: 1 } })
        : Response.json({ ok: false, description: "Bad Request: message is not modified" }, { status: 400 });
    });
    const api = telegramApi("T", fetchImpl as unknown as typeof fetch);
    await api.sendMessage("1", "What should change?", { forceReply: true });
    expect(calls[0]).toMatchObject({ reply_markup: { force_reply: true } });
    await expect(api.editMessageText("1", 1, "same")).resolves.toBeUndefined();
  });

  it("throws Telegram's description, never the token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: false, description: "Forbidden: bot was blocked" }, { status: 403 }));
    const api = telegramApi("SECRET_TOKEN", fetchImpl as unknown as typeof fetch);
    await expect(api.sendMessage("1", "x")).rejects.toThrow(/bot was blocked/);
    await expect(api.sendMessage("1", "x")).rejects.not.toThrow(/SECRET_TOKEN/);
  });
});
