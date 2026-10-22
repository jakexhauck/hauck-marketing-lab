import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "../../lib/agentFakeDb";

// The route's own gate: the secret header and the bot being configured. What
// a tap does is telegramManager.test.ts; here the network is a spy so no test
// can reach the real Telegram API.
let db: FakeDb;
vi.mock("../../lib/supabase", () => ({ getServiceClient: () => db.client() }));

import { onRequestPost } from "./webhook";
import { TELEGRAM_SECRET_HEADER } from "../../lib/telegram";

const SECRET = "hook-secret-0123456789";
const fetchSpy = vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } }));

function call(opts: { header?: string | null; env?: Record<string, unknown>; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  const presented = "header" in opts ? opts.header : SECRET;
  if (presented) headers.set(TELEGRAM_SECRET_HEADER, presented);
  const env = {
    TELEGRAM_BOT_TOKEN: "tok",
    TELEGRAM_CHAT_ID: "555",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    ...opts.env,
  };
  const request = new Request("https://app.hauckmarketing.com/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? { update_id: 1, message: { message_id: 1, chat: { id: 555 }, text: "hi" } }),
  });
  return onRequestPost({ request, env, data: {}, waitUntil: () => undefined } as never);
}

beforeEach(() => {
  db = new FakeDb();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

describe("POST /api/telegram/webhook", () => {
  it("401 on a wrong or missing secret, before anything is read", async () => {
    expect((await call({ header: "hook-secret-0123456780" })).status).toBe(401);
    expect((await call({ header: null })).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("404 while the bot is not configured", async () => {
    expect((await call({ env: { TELEGRAM_WEBHOOK_SECRET: "" } })).status).toBe(404);
    expect((await call({ env: { TELEGRAM_BOT_TOKEN: undefined } })).status).toBe(404);
  });

  it("200 and silence for a chat that is not Jake's", async () => {
    const res = await call({ body: { update_id: 2, message: { message_id: 1, chat: { id: 999 }, text: "/start" } } });
    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers /start with the chat id while TELEGRAM_CHAT_ID is unset", async () => {
    const res = await call({
      env: { TELEGRAM_CHAT_ID: undefined },
      body: { update_id: 3, message: { message_id: 1, chat: { id: 4242 }, text: "/start" } },
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/sendMessage$/);
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "4242", text: expect.stringContaining("4242") });
  });
});
