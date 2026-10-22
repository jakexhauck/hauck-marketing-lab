import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { AgentItem } from "../../src/lib/agentWire";
import { isAgentId } from "../../src/lib/agents";
import { decideItem, itemFromRow, payloadHash, runnerStatus, type ItemAction } from "./agentItems";
import {
  agentName,
  alertMessage,
  approvalMessage,
  closedText,
  parseCallback,
  telegramApi,
  telegramConfig,
  type TelegramApi,
} from "./telegram";

// The Manager on Telegram: when to message Jake, and what his taps do
// (docs/build-plans/hermes-agent-ops.md, Phase 3). Only things that need him:
// a card or a request waiting on his OK, the runner gone quiet, an agent's
// turns failing. No summaries.
//
// Every entry point is a no-op while the three TELEGRAM_* vars are not all
// set, and none throws into its caller: the card post, the reply and the
// health run must succeed whether or not Telegram does. Tables are 0179.

type Row = Record<string, unknown>;

export interface TelegramDeps {
  api?: TelegramApi;
  now?: Date;
}

/** The runner counts as offline once its newest heartbeat is this old. */
export const OFFLINE_MINUTES = 10;
/** Consecutive failed turns, per agent, before Jake hears about it. */
export const TURN_FAILS = 2;

async function clientName(client: SupabaseClient, tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const { data } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const name = (data as Row | null)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

async function openRows(client: SupabaseClient, itemId: string, kind?: "approval" | "change_prompt"): Promise<Row[]> {
  let q = client.from("telegram_messages").select("*").eq("item_id", itemId).eq("state", "open");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(`telegram messages: ${error.message}`);
  return (data ?? []) as Row[];
}

/**
 * Edit every open message for a card to say what happened, take the buttons
 * off, and close them (change prompts too, so a late reply does nothing).
 */
export async function closeItemMessages(
  client: SupabaseClient,
  api: TelegramApi,
  item: { id: string; title: string },
  outcome: string,
): Promise<number> {
  const rows = await openRows(client, item.id);
  let edited = 0;
  for (const r of rows) {
    if (r.kind === "approval") {
      try {
        await api.editMessageText(String(r.chat_id), Number(r.message_id), closedText(item.title, outcome));
        edited += 1;
      } catch (err) {
        // A message Jake deleted cannot be edited; the row still closes.
        console.warn("[telegram] edit failed:", (err as Error).message);
      }
    }
    await client.from("telegram_messages").update({ state: "closed" }).eq("id", r.id as string);
  }
  return edited;
}

/**
 * After the runner posts a card: message Jake when it waits on him and he has
 * not already been sent this exact version. A rewrite that changes the payload
 * replaces the old message (its buttons would only be refused now); one that
 * changes nothing sends nothing. A card that stops waiting closes its message.
 */
export async function notifyItem(
  env: Env,
  client: SupabaseClient,
  item: AgentItem,
  deps: TelegramDeps = {},
): Promise<"sent" | "unchanged" | "closed" | "skipped"> {
  const cfg = telegramConfig(env);
  if (!cfg) return "skipped";
  const api = deps.api ?? telegramApi(cfg.token);
  const open = await openRows(client, item.id, "approval");

  if (item.status !== "needs_ok") {
    if (!open.length) return "skipped";
    const outcome = item.status === "building" ? "Back to building. Nothing to approve yet." : "No longer waiting on you.";
    await closeItemMessages(client, api, item, outcome);
    return "closed";
  }

  const hash = await payloadHash(item.payload);
  if (open.some((r) => r.payload_hash === hash)) return "unchanged";
  if (open.length) await closeItemMessages(client, api, item, "Replaced by a newer version.");

  const { text, keyboard } = approvalMessage(item, { hash, clientName: await clientName(client, item.tenantId) });
  const sent = await api.sendMessage(cfg.chatId, text, { keyboard });
  await client.from("telegram_messages").insert({
    item_id: item.id,
    chat_id: cfg.chatId,
    message_id: sent.message_id,
    kind: "approval",
    payload_hash: hash,
    state: "open",
  });
  return "sent";
}

/** The line an approval message is edited to once the card is decided. */
export function decisionLine(action: ItemAction, where: "the app" | "Telegram", note?: string): string {
  if (action === "approve") return `Approved in ${where}.`;
  if (action === "decline") return `Declined in ${where}.`;
  return `Change asked in ${where}: ${(note ?? "").trim()}`;
}

/** Jake decided a card in the app: the Telegram side follows. */
export async function syncDecision(
  env: Env,
  client: SupabaseClient,
  item: { id: string; title: string },
  action: ItemAction,
  note?: string,
  deps: TelegramDeps = {},
): Promise<void> {
  const cfg = telegramConfig(env);
  if (!cfg) return;
  await closeItemMessages(client, deps.api ?? telegramApi(cfg.token), item, decisionLine(action, "the app", note));
}

// The parts of a Telegram Update the webhook reads.
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number | string } };
  };
}

function refusal(res: { error: number; changed?: true; reason?: string }): string {
  if (res.error === 404) return "Card not found.";
  if ("reason" in res && res.reason) return res.reason;
  if (res.changed) return "Card changed, open the app.";
  return "Already decided.";
}

async function loadItem(client: SupabaseClient, itemId: string): Promise<AgentItem | null> {
  const { data, error } = await client.from("agent_items").select("*").eq("id", itemId).maybeSingle();
  if (error) throw new Error(`item: ${error.message}`);
  return data ? itemFromRow(data as Row) : null;
}

/**
 * One webhook update, already past the secret header. Only Jake's chat is
 * answered; anything from another chat is dropped without a word. Before
 * TELEGRAM_CHAT_ID is set the bot does one thing: answers /start with the
 * chat id it came from, so Jake can paste it into the secrets.
 */
export async function handleUpdate(
  env: Env,
  client: SupabaseClient,
  update: TelegramUpdate,
  api: TelegramApi,
  now: Date = new Date(),
): Promise<string> {
  const chatId = (env.TELEGRAM_CHAT_ID ?? "").trim();
  const msg = update.message;
  const cb = update.callback_query;

  if (!chatId) {
    if (msg && /^\/start\b/.test((msg.text ?? "").trim())) {
      await api.sendMessage(String(msg.chat.id), `Your chat id is ${msg.chat.id}. Set TELEGRAM_CHAT_ID to it.`);
      return "setup";
    }
    return "ignored";
  }

  if (cb) {
    if (String(cb.message?.chat.id ?? "") !== chatId) return "ignored";
    const parsed = parseCallback(cb.data);
    if (!parsed) {
      await api.answerCallbackQuery(cb.id, "That button is out of date.");
      return "bad-callback";
    }
    const item = await loadItem(client, parsed.itemId);
    if (!item) {
      await api.answerCallbackQuery(cb.id, "Card not found.");
      return "not-found";
    }

    if (parsed.action === "approve") {
      // The version this message showed is the full hash stored when it was
      // sent, found by this very message, not the short prefix in the button.
      // decideItem then checks the card still has exactly that payload, so a
      // rewrite since (even one sharing the prefix) is refused.
      const { data: sentRow, error: sErr } = await client
        .from("telegram_messages")
        .select("*")
        .eq("chat_id", chatId)
        .eq("message_id", cb.message?.message_id ?? -1)
        .eq("item_id", item.id)
        .eq("kind", "approval")
        .maybeSingle();
      if (sErr) throw new Error(`telegram message: ${sErr.message}`);
      const shownHash = typeof (sentRow as Record<string, unknown> | null)?.payload_hash === "string" ? ((sentRow as Record<string, unknown>).payload_hash as string) : null;
      if (!shownHash || !shownHash.startsWith(parsed.hashPrefix) || (sentRow as Record<string, unknown>).state !== "open") {
        await api.answerCallbackQuery(cb.id, "Card changed, open the app.", true);
        return "stale";
      }
      const res = await decideItem(client, item.id, "approve", "", now, shownHash);
      if ("error" in res) {
        await api.answerCallbackQuery(cb.id, refusal(res), true);
        // Decided elsewhere and the edit missed it: take the buttons off now.
        if (res.error === 409 && !("changed" in res) && item.status !== "needs_ok") {
          await closeItemMessages(client, api, item, "Already decided.");
        }
        return "refused";
      }
      await api.answerCallbackQuery(cb.id, "Approved.");
      await closeItemMessages(client, api, item, decisionLine("approve", "Telegram"));
      return "approved";
    }

    if (item.status !== "needs_ok") {
      await api.answerCallbackQuery(cb.id, "Already decided.", true);
      return "refused";
    }
    const prompt = await api.sendMessage(chatId, `What should change? ${item.title}`, {
      forceReply: true,
      placeholder: "What should change?",
    });
    await client.from("telegram_messages").insert({
      item_id: item.id,
      chat_id: chatId,
      message_id: prompt.message_id,
      kind: "change_prompt",
      state: "open",
    });
    await api.answerCallbackQuery(cb.id);
    return "change-prompted";
  }

  if (msg) {
    if (String(msg.chat.id) !== chatId) return "ignored";
    const replyTo = msg.reply_to_message?.message_id;
    const note = (msg.text ?? "").trim().slice(0, 4000);
    // Only a reply to a change prompt does anything. The bot is not a chat
    // with the Manager; that lives in the app.
    if (!replyTo || !note) return "ignored";
    const { data } = await client
      .from("telegram_messages")
      .select("*")
      .eq("chat_id", chatId)
      .eq("message_id", replyTo)
      .eq("kind", "change_prompt")
      .eq("state", "open")
      .maybeSingle();
    const prompt = data as Row | null;
    if (!prompt || typeof prompt.item_id !== "string") return "ignored";
    await client.from("telegram_messages").update({ state: "closed" }).eq("id", prompt.id as string);

    const res = await decideItem(client, prompt.item_id, "change", note, now);
    if ("error" in res) {
      await api.sendMessage(chatId, `Not sent: ${refusal(res)}`, { replyTo: msg.message_id });
      return "refused";
    }
    await api.sendMessage(chatId, `Sent to the ${agentName(res.item.agent)}.`, { replyTo: msg.message_id });
    await closeItemMessages(client, api, res.item, decisionLine("change", "Telegram", note));
    return "changed";
  }
  return "ignored";
}

async function alertRow(client: SupabaseClient, key: string): Promise<Row | null> {
  const { data } = await client.from("telegram_alerts").select("*").eq("key", key).maybeSingle();
  return (data as Row | null) ?? null;
}

async function saveAlert(client: SupabaseClient, row: Row, now: Date): Promise<void> {
  const { error } = await client
    .from("telegram_alerts")
    .upsert({ ...row, updated_at: now.toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`telegram alert: ${error.message}`);
}

/**
 * From the scheduled health run: the runner has sent no heartbeat for over
 * OFFLINE_MINUTES. Read like the rail footer (the newest heartbeat of any
 * host), so a PC switched off for the night is not an incident while the VPS
 * runner is up. Once per incident; a fresh heartbeat clears it silently.
 */
// The VPS runner's host name (deploy/vps/docker-compose.yml, hostname).
export const VPS_HOST = "hauck-vps";

export async function checkRunnerOffline(
  env: Env,
  client: SupabaseClient,
  deps: TelegramDeps = {},
): Promise<"alerted" | "cleared" | "ok" | "skipped"> {
  const cfg = telegramConfig(env);
  if (!cfg) return "skipped";
  const now = deps.now ?? new Date();
  const { data, error } = await client.from("agent_runner_state").select("host, last_seen_at");
  if (error) throw new Error(`runner state: ${error.message}`);
  // Every Hermes agent answers from the VPS runner, so that is the one watched
  // when it exists. The PC runner is off whenever the PC is, which is normal
  // and not worth a message; but the PC being up must not hide the VPS down.
  const rows = (data ?? []) as { host: string; last_seen_at: string | null }[];
  const vps = rows.filter((r) => r.host === VPS_HOST);
  const { lastSeenAt } = runnerStatus(vps.length ? vps : rows, now);
  // No heartbeat ever is a runner never installed, not one that went down.
  if (!lastSeenAt) return "ok";
  const minutes = Math.floor((now.getTime() - Date.parse(lastSeenAt)) / 60000);
  const row = await alertRow(client, "runner");

  if (minutes > OFFLINE_MINUTES) {
    if (row?.alerted_at) return "ok";
    const api = deps.api ?? telegramApi(cfg.token);
    await api.sendMessage(cfg.chatId, alertMessage("runner_offline", `No heartbeat for ${minutes} minutes. Agents are not answering.`));
    await saveAlert(client, { key: "runner", fails: 0, alerted_at: now.toISOString(), detail: `last seen ${lastSeenAt}` }, now);
    return "alerted";
  }
  if (row?.alerted_at) {
    await saveAlert(client, { key: "runner", fails: 0, alerted_at: null, detail: null }, now);
    return "cleared";
  }
  return "ok";
}

/**
 * After the runner finishes a turn: count failures in a row per agent and
 * tell Jake at the second, once. A turn that succeeds resets the count and
 * clears the incident. The message id is kept so a re-posted reply for the
 * same turn is not counted twice.
 */
export async function trackTurn(
  env: Env,
  client: SupabaseClient,
  turn: { messageId: string; status: "done" | "error"; error?: string | null },
  deps: TelegramDeps = {},
): Promise<"alerted" | "counted" | "reset" | "ok" | "skipped"> {
  const cfg = telegramConfig(env);
  if (!cfg) return "skipped";
  const now = deps.now ?? new Date();
  const { data: me } = await client.from("agent_messages").select("chat_id").eq("id", turn.messageId).maybeSingle();
  const chatRowId = (me as Row | null)?.chat_id;
  if (typeof chatRowId !== "string") return "skipped";
  const { data: chat } = await client.from("agent_chats").select("agent, tenant_id").eq("id", chatRowId).maybeSingle();
  const agent = (chat as Row | null)?.agent;
  if (typeof agent !== "string" || !isAgentId(agent)) return "skipped";

  const key = `turn:${agent}`;
  const row = await alertRow(client, key);
  if (row?.last_ref === turn.messageId) return "ok";

  if (turn.status === "done") {
    if (!row || (!row.fails && !row.alerted_at)) return "ok";
    await saveAlert(client, { key, fails: 0, last_ref: turn.messageId, alerted_at: null, detail: null }, now);
    return "reset";
  }

  const fails = (typeof row?.fails === "number" ? row.fails : 0) + 1;
  const reason = (turn.error ?? "runner error").trim().slice(0, 300);
  const alert = fails >= TURN_FAILS && !row?.alerted_at;
  if (alert) {
    const where = await clientName(client, ((chat as Row).tenant_id as string | null) ?? null);
    const api = deps.api ?? telegramApi(cfg.token);
    await api.sendMessage(
      cfg.chatId,
      alertMessage("turn_errors", `${agentName(agent)}${where ? ` at ${where}` : ""} failed ${fails} turns in a row.\nLast error: ${reason}`),
    );
  }
  await saveAlert(
    client,
    {
      key,
      fails,
      last_ref: turn.messageId,
      alerted_at: alert ? now.toISOString() : ((row?.alerted_at as string | null | undefined) ?? null),
      detail: reason,
    },
    now,
  );
  return alert ? "alerted" : "counted";
}
