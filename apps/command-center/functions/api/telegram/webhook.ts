import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { logError } from "../../lib/errorLog";
import { TELEGRAM_SECRET_HEADER, telegramApi, webhookSecretMatches } from "../../lib/telegram";
import { handleUpdate, type TelegramUpdate } from "../../lib/telegramManager";

// POST /api/telegram/webhook  body: a Telegram Update -> { ok: true }
//
// The Manager's bot. Public in _middleware.ts because Telegram's servers call
// it, so it guards itself: Telegram echoes TELEGRAM_WEBHOOK_SECRET (set with
// setWebhook, scripts/telegram-set-webhook.mjs) in its secret-token header,
// and a wrong or missing one is a 401 before anything is read. Past that,
// lib/telegramManager.handleUpdate answers Jake's chat only.
//
// Approve and Change go through decideItem, the same as the app's buttons.
// Any failure after the gate is still a 200: Telegram retries a non-2xx for
// hours, and a retried tap must not be the thing that acts twice.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = (ctx.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const secret = (ctx.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  // Unset means the bot is off, not open.
  if (!token || !secret) return Response.json({ error: "not configured" }, { status: 404 });
  if (!webhookSecretMatches(ctx.request.headers.get(TELEGRAM_SECRET_HEADER), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  try {
    await handleUpdate(ctx.env, client, update, telegramApi(token));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[telegram] update failed:", message);
    await logError(ctx.env, "telegram", message, { updateId: update.update_id ?? null }, client).catch(() => false);
  }
  return Response.json({ ok: true });
};
