import type { Env } from "./env";
import type { AgentItem } from "../../src/lib/agentWire";
import { AGENTS, agentPath, type AgentId } from "../../src/lib/agents";
import { itemPayload } from "../../src/lib/agentView";
import { stripEmDash } from "./agentRunner";

// The Manager on Telegram (docs/build-plans/hermes-agent-ops.md, Phase 3).
//
// A tiny Bot API client (plain fetch, no SDK) and the pure builders for what
// the bot says. Everything that reads or writes the database lives in
// telegramManager.ts; this file only knows Telegram's shapes, so the text and
// the button data are tested without a network or a table.
//
// Messages go to Jake alone, so naming GHL here is fine. Plain text only (no
// parse_mode): a card title with a stray underscore or asterisk must never
// turn a send into a 400.

export const APP_URL = "https://app.hauckmarketing.com";

// Telegram refuses a message over 4096 characters. Kept well under it, since
// a card worth reading on a phone is far shorter anyway.
const MAX_TEXT = 3500;
const MAX_LINES = 8;
const MAX_LINE = 180;

export interface TelegramConfig {
  token: string;
  chatId: string;
  secret: string;
}

/** All three set, or null: the bot stays silent rather than half working. */
export function telegramConfig(env: Env): TelegramConfig | null {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (env.TELEGRAM_CHAT_ID ?? "").trim();
  const secret = (env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  return token && chatId && secret ? { token, chatId, secret } : null;
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type Keyboard = InlineButton[][];

export interface SendOptions {
  keyboard?: Keyboard;
  forceReply?: boolean;
  placeholder?: string;
  replyTo?: number;
}

export interface TelegramApi {
  sendMessage(chatId: string, text: string, opts?: SendOptions): Promise<{ message_id: number }>;
  editMessageText(chatId: string, messageId: number, text: string, keyboard?: Keyboard): Promise<void>;
  answerCallbackQuery(id: string, text?: string, alert?: boolean): Promise<void>;
}

export class TelegramError extends Error {}

/**
 * The Bot API over fetch. Errors throw a TelegramError carrying Telegram's
 * own description, never the token (it is in the URL, so the URL is never
 * put in a message).
 */
export function telegramApi(token: string, fetchImpl: typeof fetch = fetch): TelegramApi {
  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let json: { ok?: boolean; result?: T; description?: string } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      // A non-JSON answer is reported by status below.
    }
    if (!res.ok || !json.ok) throw new TelegramError(`${method}: ${json.description ?? `HTTP ${res.status}`}`);
    return json.result as T;
  }

  return {
    async sendMessage(chatId, text, opts = {}) {
      const body: Record<string, unknown> = { chat_id: chatId, text: clip(text), disable_web_page_preview: true };
      if (opts.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
      if (opts.forceReply) {
        body.reply_markup = { force_reply: true, ...(opts.placeholder ? { input_field_placeholder: opts.placeholder.slice(0, 64) } : {}) };
      }
      if (opts.replyTo) body.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true };
      return call<{ message_id: number }>("sendMessage", body);
    },
    async editMessageText(chatId, messageId, text, keyboard) {
      try {
        await call("editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: clip(text),
          disable_web_page_preview: true,
          // An empty keyboard is what takes the buttons off.
          reply_markup: { inline_keyboard: keyboard ?? [] },
        });
      } catch (err) {
        // Editing to the same text is a 400 from Telegram, and harmless.
        if (err instanceof TelegramError && /not modified/i.test(err.message)) return;
        throw err;
      }
    },
    async answerCallbackQuery(id, text, alert) {
      await call("answerCallbackQuery", {
        callback_query_id: id,
        ...(text ? { text: text.slice(0, 200) } : {}),
        ...(alert ? { show_alert: true } : {}),
      });
    },
  };
}

function clip(text: string): string {
  const t = stripEmDash(text);
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 3)}...` : t;
}

function line(s: string): string {
  const t = stripEmDash(s.replace(/\s+/g, " ").trim());
  return t.length > MAX_LINE ? `${t.slice(0, MAX_LINE - 3)}...` : t;
}

/** The header Telegram echoes the setWebhook secret_token in. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Constant time in the equal-length case, so the header leaks no prefix. */
export function webhookSecretMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  const a = (presented ?? "").trim();
  const b = (expected ?? "").trim();
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Callback data is capped at 64 bytes by Telegram. A uuid is 36, so Approve
// carries only the first 8 hex of the payload hash; the webhook recomputes the
// full hash from the card as it is now and refuses on a mismatch, then hands
// the full hash to decideItem, which checks it again under the write.
export const HASH_PREFIX = 8;

export function approveData(itemId: string, hash: string): string {
  return `a:${itemId}:${hash.slice(0, HASH_PREFIX)}`;
}

export function changeData(itemId: string): string {
  return `c:${itemId}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const APPROVE_RE = new RegExp(`^a:(${UUID}):([0-9a-f]{${HASH_PREFIX}})$`, "i");
const CHANGE_RE = new RegExp(`^c:(${UUID})$`, "i");

export type Callback = { action: "approve"; itemId: string; hashPrefix: string } | { action: "change"; itemId: string };

export function parseCallback(data: unknown): Callback | null {
  if (typeof data !== "string") return null;
  const a = APPROVE_RE.exec(data);
  if (a) return { action: "approve", itemId: a[1].toLowerCase(), hashPrefix: a[2].toLowerCase() };
  const c = CHANGE_RE.exec(data);
  if (c) return { action: "change", itemId: c[1].toLowerCase() };
  return null;
}

export function agentName(id: AgentId | null | undefined): string {
  return AGENTS.find((a) => a.id === id)?.name ?? "Agent";
}

/** The agent's chat in the admin app, opened on the card's chat when known. */
export function chatLink(item: Pick<AgentItem, "tenantId" | "agent" | "chatId">, appUrl = APP_URL): string {
  const base = `${appUrl}${agentPath(item.tenantId, item.agent)}`;
  return item.chatId ? `${base}?chat=${encodeURIComponent(item.chatId)}` : base;
}

/**
 * What a card waiting on Jake says on Telegram: the title, who and where, the
 * lines an Approve would carry out (the same ones the card draws in the app),
 * then Approve, Change and a link to the chat.
 */
export function approvalMessage(
  item: AgentItem,
  opts: { hash: string; clientName?: string | null; appUrl?: string },
): { text: string; keyboard: Keyboard } {
  const p = itemPayload(item.payload);
  const where = opts.clientName ? `${agentName(item.agent)}, ${opts.clientName}` : agentName(item.agent);
  const head = [line(item.title), item.fromAgent ? `Request from ${agentName(item.fromAgent)} to ${where}` : where];

  const body: string[] = [];
  if (item.fromAgent && typeof item.payload.body === "string" && item.payload.body.trim()) body.push(line(item.payload.body));
  const bullets = [
    ...p.plan,
    ...p.changes.map((c) => c.text),
    ...p.taskChanges.map((t) => `${t.kind}: ${t.text}`),
  ].map(line).filter(Boolean);
  const shown = bullets.slice(0, MAX_LINES).map((b) => `- ${b}`);
  if (bullets.length > MAX_LINES) shown.push(`- and ${bullets.length - MAX_LINES} more in the app`);
  body.push(...shown);
  if (!bullets.length && p.quote) body.push(line(p.quote));
  if (!bullets.length && !p.quote && p.what) body.push(line(p.what));
  if (p.credits) body.push(`Spends up to ${p.credits} credits.`);
  if (p.deploy) body.push("Approve puts the page live.");
  if (p.previewUrl) body.push(`Preview: ${p.previewUrl}`);

  const text = [...head, ...(body.length ? ["", ...body] : [])].join("\n");
  const keyboard: Keyboard = [
    [
      { text: "Approve", callback_data: approveData(item.id, opts.hash) },
      { text: "Change", callback_data: changeData(item.id) },
    ],
    [{ text: "Open", url: chatLink(item, opts.appUrl) }],
  ];
  return { text: clip(text), keyboard };
}

/** The approval message once it no longer waits: the title and what happened. */
export function closedText(title: string, outcome: string): string {
  return clip(`${line(title)}\n\n${line(outcome)}`);
}

export type AlertKind = "runner_offline" | "turn_errors";

export function alertMessage(kind: AlertKind, detail: string): string {
  const head = kind === "runner_offline" ? "Agent runner offline" : "Agent turns failing";
  return clip(`${head}\n\n${detail.trim().slice(0, 600)}`);
}
