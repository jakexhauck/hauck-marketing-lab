import type { Env } from "./env";
import { ghlJson } from "./ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "./agencyGhl";
import { callStamp, latestOutboundCall, type CallStamp, type GhlCallMessage } from "./coldCallBridge";
import { outboundCallsSince, type RecentConversation } from "./powerDialer";

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

// ---------------------------------------------------------------------------
// Following the power dialer (0113).
//
// The same reading, done the other way round. Above, the app knows which
// prospect it called and asks what that call became. Here it knows nothing: a
// dialer it does not drive is working a list, and the question is who was just
// rung. The answer is whichever conversation moved last.

interface RecentSearchResponse {
  conversations?: RecentConversation[];
}

// The conversations that have just moved, newest first. One request, and the
// only one a quiet poll makes.
//
// Sorted by GoHighLevel rather than here, because the sort is what makes a
// single page enough: the calls a dialer is placing right now are by definition
// the most recent activity on the account.
export async function fetchRecentConversations(
  env: Env,
  limit = 25,
): Promise<RecentConversation[]> {
  if (!isAgencyGhlConfigured(env)) return [];
  const ctx = getAgencyGhlContext(env);
  try {
    const res = await ghlJson<RecentSearchResponse>(
      ctx,
      `/conversations/search?locationId=${encodeURIComponent(ctx.locationId)}` +
        `&limit=${limit}&sort=desc&sortBy=last_message_date`,
    );
    return res.conversations ?? [];
  } catch {
    // A poll that fails is a poll: the next one is eight seconds away, and the
    // page it feeds shows what it already had rather than an error nobody on the
    // phones can act on.
    return [];
  }
}

// Every outbound call on one conversation since a moment, oldest first.
export async function fetchConversationCalls(
  env: Env,
  conversationId: string,
  sinceMs: number,
): Promise<{ message: GhlCallMessage; atMs: number }[]> {
  if (!isAgencyGhlConfigured(env) || !conversationId) return [];
  const ctx = getAgencyGhlContext(env);
  try {
    const res = await ghlJson<MessagesResponse>(
      ctx,
      `/conversations/${encodeURIComponent(conversationId)}/messages?limit=25`,
    );
    return outboundCallsSince(unwrap(res), sinceMs);
  } catch {
    return [];
  }
}

export interface AgencyContactFacts {
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  website: string;
}

interface ContactResponse {
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    contactName?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    companyName?: string | null;
    website?: string | null;
  } | null;
}

// Who the contact is, for a prospect this app has never seen.
//
// Read only when a call arrives for somebody who is not in the book, which is
// the whole point of following a dialer that can be pointed at any list in
// GoHighLevel. On the common path (a prospect the app pushed there itself) this
// is never called.
export async function fetchAgencyContact(
  env: Env,
  contactId: string,
): Promise<AgencyContactFacts | null> {
  if (!isAgencyGhlConfigured(env) || !contactId) return null;
  const ctx = getAgencyGhlContext(env);
  try {
    const res = await ghlJson<ContactResponse>(
      ctx,
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const c = res.contact;
    if (!c) return null;
    return {
      firstName: (c.firstName ?? "").trim(),
      lastName: (c.lastName ?? "").trim(),
      name: (c.contactName ?? c.name ?? "").trim(),
      phone: (c.phone ?? "").trim(),
      email: (c.email ?? "").trim(),
      companyName: (c.companyName ?? "").trim(),
      website: (c.website ?? "").trim(),
    };
  } catch {
    return null;
  }
}
