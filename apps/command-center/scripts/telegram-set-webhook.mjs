// Point the Manager's Telegram bot at the app (docs/build-plans/hermes-agent-ops.md, Phase 3).
//
// Telegram only delivers updates to one webhook URL per bot, and only echoes
// the secret header the app checks if setWebhook was told it. Run once after
// the bot is made, and again whenever TELEGRAM_WEBHOOK_SECRET changes.
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment, so
// the secrets never sit in a file or the shell history:
//
//   doppler run -p hauck-command-center -c prd -- node scripts/telegram-set-webhook.mjs
//
// Prints Telegram's answer and the webhook info after it. The token is never
// printed.

const URL_TARGET = "https://app.hauckmarketing.com/api/telegram/webhook";

const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set.");
  process.exit(1);
}
// Telegram's own rule for secret_token: 1 to 256 of A-Z, a-z, 0-9, _ and -.
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET may only hold letters, digits, _ and - (Telegram's rule).");
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(`${method}: ${json.description ?? `HTTP ${res.status}`}`);
  return json.result;
}

try {
  await call("setWebhook", {
    url: URL_TARGET,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    // Taps queued while the webhook was elsewhere are old news.
    drop_pending_updates: true,
  });
  console.log(`Webhook set to ${URL_TARGET}`);
  const info = await call("getWebhookInfo");
  console.log(JSON.stringify({ url: info.url, pending: info.pending_update_count, lastError: info.last_error_message ?? null }, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
