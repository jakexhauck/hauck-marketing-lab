import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import type { Env } from "./env";

// One push_subscriptions row, keyed to an individual chat participant via the
// participant_kind / participant_id columns added in migration 0016.
interface ChatSubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ChatPushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Send a Web Push to every subscription belonging to the given chat recipients.
 * Recipients are individual participants ({ kind, id }), not a whole tenant.
 * Fully inert when VAPID keys are unset or Supabase is unconfigured. Mirrors the
 * fan-out in push.ts: reconstruct the PushSubscription from split columns, build
 * the payload, POST to the endpoint, prune dead subscriptions on 404 / 410.
 * Never throws into the caller; the message send must succeed even if push fails.
 */
export async function sendChatPush(
  env: Env,
  recipients: { kind: string; id: string }[],
  payload: ChatPushPayload,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  if (recipients.length === 0) return;

  const client = getServiceClient(env);
  if (!client) return;

  // Load every subscription whose (participant_kind, participant_id) is in the
  // recipient set. Supabase has no tuple-IN, so query per (kind, id) and merge.
  const rowsByEndpoint = new Map<string, ChatSubRow>();
  await Promise.all(
    recipients.map(async (r) => {
      const { data } = await client
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("participant_kind", r.kind)
        .eq("participant_id", r.id);
      for (const row of (data as ChatSubRow[] | null) ?? []) {
        rowsByEndpoint.set(row.endpoint, row);
      }
    }),
  );
  const rows = [...rowsByEndpoint.values()];
  if (rows.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });

  const vapid = {
    subject: "mailto:jake@hauckmarketing.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        const built = await buildPushPayload(
          { data, options: { ttl: 60 } },
          subscription,
          vapid,
        );
        const res = await fetch(row.endpoint, built);
        if (res.status === 404 || res.status === 410) {
          await client.from("push_subscriptions").delete().eq("id", row.id);
        }
      } catch (err) {
        console.error("[chatPush] send failed for", row.id, err);
      }
    }),
  );
}

// Short notification body from a message. Strips newlines, caps the length so a
// long message does not blow out the OS notification.
export function chatPreview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "Sent an attachment";
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}
