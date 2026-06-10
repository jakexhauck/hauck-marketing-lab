import { ghlJson, type GhlContext } from "./ghl";

// Channels GHL routes through /conversations/messages. SMS and the social/DM
// channels send a plain `message`; Email sends `subject` + `html`.
export const ALLOWED_CHANNELS = [
  "SMS",
  "Email",
  "FB",
  "IG",
  "GMB",
  "WhatsApp",
  "Live_Chat",
  "Custom",
] as const;

export type Channel = (typeof ALLOWED_CHANNELS)[number];

export function isAllowedChannel(c: string): c is Channel {
  return (ALLOWED_CHANNELS as readonly string[]).includes(c);
}

interface SendResponse {
  messageId?: string;
  conversationId?: string;
  msg?: string;
}

export interface SendInput {
  channel: string;
  body: string;
  subject?: string;
}

// Build the GHL message payload for a channel. Email carries subject + html;
// everything else carries a plain message.
function buildMessage(
  contactId: string,
  channel: Channel,
  body: string,
  subject?: string,
): Record<string, unknown> {
  if (channel === "Email") {
    return { type: "Email", contactId, subject: subject ?? "", html: body };
  }
  return { type: channel, contactId, message: body };
}

// Validate + send. Returns a Response on validation failure (caller returns it),
// otherwise the GHL send result. Keeps the leads and conversations routes identical.
export async function sendChannelMessage(
  ctx: GhlContext,
  contactId: string,
  input: SendInput,
): Promise<{ error: { code: string; status: number } } | SendResponse> {
  const body = input.body?.trim();
  if (!body) return { error: { code: "empty_message", status: 400 } };

  const channel = (input.channel ?? "SMS").trim();
  if (!isAllowedChannel(channel)) {
    return { error: { code: "invalid_channel", status: 400 } };
  }
  if (channel === "Email" && !input.subject?.trim()) {
    return { error: { code: "subject_required", status: 400 } };
  }

  return ghlJson<SendResponse>(ctx, `/conversations/messages`, {
    method: "POST",
    body: JSON.stringify(
      buildMessage(contactId, channel, body, input.subject?.trim()),
    ),
  });
}

// GHL message payloads carry the channel two ways: `messageType`, a documented
// string enum (TYPE_SMS, TYPE_EMAIL, ...), and `type`, an undocumented number.
// The old code called .toUpperCase() on whichever arrived, which crashed on the
// numeric form. Normalize here: prefer the documented string, fall back to a
// string `type`, and map numeric `type` only through the values we have
// evidence for (the GHL docs example pairs type 1 with messageType "SMS").
// Unknown numerics become "" and downstream defaults handle it (SMS).
const NUMERIC_TYPE: Record<number, string> = {
  1: "SMS",
  3: "Email",
};

// TYPE_-enum stems to the app's channel vocabulary. Stems that are not real
// reply channels (calls, reviews, activities) fall through unmapped so the
// system-message filter still sees ACTIVITY/OPPORTUNITY markers.
const ENUM_STEM_CHANNEL: Record<string, string> = {
  SMS: "SMS",
  CAMPAIGN_SMS: "SMS",
  CAMPAIGN_MANUAL_SMS: "SMS",
  CUSTOM_SMS: "SMS",
  CUSTOM_PROVIDER_SMS: "SMS",
  GROUP_SMS: "SMS",
  EMAIL: "Email",
  CAMPAIGN_EMAIL: "Email",
  CUSTOM_EMAIL: "Email",
  CUSTOM_PROVIDER_EMAIL: "Email",
  FACEBOOK: "FB",
  CAMPAIGN_FACEBOOK: "FB",
  FACEBOOK_COMMENT: "FB",
  FB_MESSENGER: "FB",
  INSTAGRAM: "IG",
  INSTAGRAM_COMMENT: "IG",
  GMB: "GMB",
  CAMPAIGN_GMB: "GMB",
  WHATSAPP: "WhatsApp",
  LIVE_CHAT: "Live_Chat",
  LIVE_CHAT_INFO_MESSAGE: "Live_Chat",
  WEBCHAT: "Live_Chat",
};

export function normalizeMessageType(m: {
  type?: unknown;
  messageType?: unknown;
}): string {
  let raw = "";
  if (typeof m.messageType === "string" && m.messageType) {
    raw = m.messageType;
  } else if (typeof m.type === "string" && m.type) {
    raw = m.type;
  } else if (typeof m.type === "number") {
    return NUMERIC_TYPE[m.type] ?? "";
  }
  if (!raw) return "";
  const stem = raw.startsWith("TYPE_") ? raw.slice(5) : raw;
  return ENUM_STEM_CHANNEL[stem.toUpperCase()] ?? stem;
}

interface ShapedMessage {
  type: string;
  direction: string;
}

interface ThreadConversation {
  id: string;
  contactId?: string;
  lastMessageDate?: string | number;
  unreadCount?: number;
}

interface ThreadSearchResp {
  conversations?: ThreadConversation[];
}

interface ThreadMessagesResp {
  messages?: {
    lastMessageId?: string;
    nextPage?: boolean;
    messages?: {
      id: string;
      body?: string;
      direction?: string;
      dateAdded?: string;
      type?: unknown;
      messageType?: unknown;
    }[];
  };
}

export interface ThreadMessage {
  id: string;
  body: string;
  direction: string;
  type: string;
  at: string;
}

export interface ContactThread {
  conversationId: string | null;
  messages: ThreadMessage[];
  // True when the thread has more history than the page cap fetched; the UI
  // can someday surface "older messages in GHL".
  truncated: boolean;
  // Unread total across ALL of the contact's conversations, not just the
  // displayed one.
  unreadCount: number;
}

function isSystemMessage(type: string): boolean {
  if (!type) return false;
  const upper = type.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

const THREAD_PAGE_LIMIT = 100;
const THREAD_MAX_PAGES = 5;

// Shared thread loader for the per-contact message endpoints. A contact can
// have several conversations (one per channel, or after merges); show the one
// with the most recent activity rather than whichever the search returned
// first, and follow the lastMessageId cursor so threads longer than GHL's
// default page render fully. Sends need no conversation choice at all:
// POST /conversations/messages is keyed by contactId and GHL threads it
// server-side.
export async function fetchContactThread(
  ctx: GhlContext,
  contactId: string,
): Promise<ContactThread> {
  const search = await ghlJson<ThreadSearchResp>(
    ctx,
    `/conversations/search?locationId=${encodeURIComponent(ctx.locationId)}&contactId=${encodeURIComponent(contactId)}`,
  );

  const convs = (search.conversations ?? []).filter((c) => Boolean(c.id));
  if (convs.length === 0) {
    return { conversationId: null, messages: [], truncated: false, unreadCount: 0 };
  }

  const sortKey = (c: ThreadConversation): number => {
    if (typeof c.lastMessageDate === "number") return c.lastMessageDate;
    const t = +new Date(c.lastMessageDate ?? 0);
    return Number.isFinite(t) ? t : 0;
  };
  const conv = [...convs].sort((a, b) => sortKey(b) - sortKey(a))[0];
  const unreadCount = convs.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  const raw: NonNullable<NonNullable<ThreadMessagesResp["messages"]>["messages"]> = [];
  let cursor: string | undefined;
  let truncated = false;
  for (let page = 0; page < THREAD_MAX_PAGES; page++) {
    const qs = cursor
      ? `?limit=${THREAD_PAGE_LIMIT}&lastMessageId=${encodeURIComponent(cursor)}`
      : `?limit=${THREAD_PAGE_LIMIT}`;
    const resp = await ghlJson<ThreadMessagesResp>(
      ctx,
      `/conversations/${encodeURIComponent(conv.id)}/messages${qs}`,
    );
    raw.push(...(resp.messages?.messages ?? []));
    const hasMore = Boolean(resp.messages?.nextPage);
    cursor = resp.messages?.lastMessageId;
    if (!hasMore || !cursor) break;
    if (page === THREAD_MAX_PAGES - 1) truncated = true;
  }

  const messages: ThreadMessage[] = [];
  for (const m of raw) {
    const type = normalizeMessageType(m);
    if (isSystemMessage(type)) continue;
    messages.push({
      id: m.id,
      body: m.body ?? "",
      direction: (m.direction ?? "outbound").toLowerCase(),
      type: type || "SMS",
      at: m.dateAdded ?? new Date().toISOString(),
    });
  }
  messages.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return { conversationId: conv.id, messages, truncated, unreadCount };
}

// Default reply channel = the last inbound message's channel (reply where they
// reached you), else the last message's, else SMS. availableChannels = channels
// seen in the thread, always offering SMS + Email as fallbacks.
export function channelMeta(messages: ShapedMessage[]): {
  defaultChannel: string;
  availableChannels: string[];
} {
  const seen = new Set<string>();
  for (const m of messages) if (m.type) seen.add(m.type);
  seen.add("SMS");
  seen.add("Email");

  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.direction === "inbound");
  const last = messages[messages.length - 1];
  const defaultChannel = lastInbound?.type ?? last?.type ?? "SMS";

  return {
    defaultChannel: isAllowedChannel(defaultChannel) ? defaultChannel : "SMS",
    availableChannels: [...seen].filter(isAllowedChannel),
  };
}
