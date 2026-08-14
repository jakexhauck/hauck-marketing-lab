import type { Env } from "./env";
import { ghlJson } from "./ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "./agencyGhl";
import { callStamp, latestOutboundCall, type CallStamp, type GhlCallMessage } from "./coldCallBridge";

// Reading a placed call back out of GoHighLevel.
//
// The two requests that turn "we asked GHL to dial" into "the call lasted 74
// seconds": find the prospect's conversation, then read its newest outbound call
// message. The picking rules live in coldCallBridge.ts, which is pure and tested;
// this file is only the talking.
//
// Best effort by design. Every caller of this treats a null as "no duration yet"
// and carries on, because the dial row is the record that matters and it is
// already written by the time this runs.

interface SearchResponse {
  conversations?: { id?: string }[];
}

interface MessagesResponse {
  messages?: { messages?: GhlCallMessage[] } | GhlCallMessage[];
}

// GHL returns messages as { messages: { messages: [...] } } on the conversation
// endpoint. Tolerating both shapes because a nested envelope is exactly the kind
// of thing that changes under a version bump, and the cost of being wrong here is
// a silently missing duration rather than a visible error.
function unwrap(res: MessagesResponse): GhlCallMessage[] {
  const m = res.messages;
  if (Array.isArray(m)) return m;
  return m?.messages ?? [];
}

// The newest outbound call on this contact since `since` (a millisecond
// timestamp), or null when there is not one yet.
export async function fetchLatestCall(
  env: Env,
  contactId: string,
  since?: number,
): Promise<CallStamp | null> {
  if (!isAgencyGhlConfigured(env) || !contactId) return null;
  const ctx = getAgencyGhlContext(env);

  try {
    const search = await ghlJson<SearchResponse>(
      ctx,
      `/conversations/search?locationId=${encodeURIComponent(ctx.locationId)}&contactId=${encodeURIComponent(contactId)}`,
    );
    const conversationId = search.conversations?.[0]?.id;
    if (!conversationId) return null;

    const res = await ghlJson<MessagesResponse>(
      ctx,
      `/conversations/${encodeURIComponent(conversationId)}/messages?limit=25`,
    );
    const call = latestOutboundCall(unwrap(res), since);
    return call ? callStamp(call) : null;
  } catch {
    // Swallowed on purpose. This runs on the outcome press, the busiest moment
    // in the shift, and a CRM read that failed must never turn into an error the
    // caller has to dismiss before reaching the next prospect.
    return null;
  }
}
