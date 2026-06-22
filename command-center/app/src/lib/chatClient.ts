import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ChatConfig {
  url: string;
  anonKey: string;
  // The caller's tenant id for the presence channel; null for admin sessions.
  tenantId: string | null;
}

// Person topic a browser subscribes to for its own notify-only broadcasts.
// MUST match functions/lib/chatRealtime.ts personTopic() exactly.
export function personTopic(kind: string, id: string): string {
  return `chat:person:${kind}:${id}`;
}

// Tenant-wide presence channel. MUST match functions/lib/chatRealtime.ts
// tenantPresenceTopic() exactly.
export function tenantPresenceTopic(tenantId: string): string {
  return `chat:presence:${tenantId}`;
}

// A presence id is the channel key tracked on the presence channel: "kind:id".
// chatLogic.isOnline() and the roster check membership against this exact shape.
export function presenceId(kind: string, id: string): string {
  return `${kind}:${id}`;
}

// One realtime socket per tab. Built lazily from /api/chat/config the first time
// realtime is needed, then reused. eventsPerSecond is capped low: we only send
// presence + tiny notify broadcasts, never message bodies.
let cached: SupabaseClient | null = null;

export function buildChatClient(cfg: ChatConfig): SupabaseClient {
  if (cached) return cached;
  cached = createClient(cfg.url, cfg.anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return cached;
}

// Test hook: drop the cached client so a fresh config can rebuild it.
export function resetChatClient(): void {
  cached = null;
}
