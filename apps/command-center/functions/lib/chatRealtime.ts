import type { Env } from "./env";

export type ChatRealtimeEvent = {
  kind: "message" | "read" | "channel" | "presence_dirty";
  channelId?: string;
};

export function personTopic(kind: string, id: string): string {
  return `chat:person:${kind}:${id}`;
}

export function tenantPresenceTopic(tenantId: string): string {
  return `chat:presence:${tenantId}`;
}

// Fire-and-forget: POST a broadcast per recipient to the Realtime HTTP API.
// Payload is a notify ping only (event kind + optional channel id); no content.
// Never throws into the request path; log and move on.
export async function notifyParticipants(
  env: Env,
  recipients: { kind: string; id: string }[],
  event: ChatRealtimeEvent,
): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || recipients.length === 0) return;
  const url = `${env.SUPABASE_URL}/realtime/v1/api/broadcast`;
  const messages = recipients.map((r) => ({
    topic: personTopic(r.kind, r.id),
    event: "chat",
    payload: event,
  }));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) console.warn("[chatRealtime] broadcast", res.status, await res.text());
  } catch (e) {
    console.warn("[chatRealtime] broadcast failed", e);
  }
}
