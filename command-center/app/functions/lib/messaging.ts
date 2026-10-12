import { ghlJson, fetchContact, type GhlContext } from "./ghl";
import {
  parseInternalRecipients,
  isInternalRecipient,
} from "./internalRecipients";

// Guard for every per-contact thread endpoint. Resolves the contact and applies
// the internal-recipient predicate, so a notification sink is never readable or
// repliable even when its contact id is known.
//
// Fails open on a GHL lookup failure: fetchContact returns null, the predicate
// says false, and a real lead's thread still loads. Hiding a real conversation
// because GHL blipped would be the worse failure.
export async function isInternalContact(
  ctx: GhlContext,
  contactId: string,
  internalRecipients: string | undefined,
): Promise<boolean> {
  const contact = await fetchContact(ctx, contactId);
  return isInternalRecipient(contact, parseInternalRecipients(internalRecipients));
}

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
  // Picture URLs from ghlUploadAttachment, sent as an MMS. Texts only.
  attachments?: string[];
}

const MAX_ATTACHMENTS = 5;

// Only https URLs ride along, at most five (GHL's per-message cap).
export function cleanAttachments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u): u is string => typeof u === "string" && /^https:\/\/\S+$/.test(u))
    .slice(0, MAX_ATTACHMENTS);
}

// Build the GHL message payload for a channel. Email carries subject + html;
// everything else carries a plain message.
function buildMessage(
  contactId: string,
  channel: Channel,
  body: string,
  subject?: string,
  attachments: string[] = [],
): Record<string, unknown> {
  if (channel === "Email") {
    return { type: "Email", contactId, subject: subject ?? "", html: body };
  }
  return attachments.length > 0
    ? { type: channel, contactId, message: body, attachments }
    : { type: channel, contactId, message: body };
}

// Validate + send. Returns a Response on validation failure (caller returns it),
// otherwise the GHL send result. Keeps the leads and conversations routes identical.
export async function sendChannelMessage(
  ctx: GhlContext,
  contactId: string,
  input: SendInput,
): Promise<{ error: { code: string; status: number } } | SendResponse> {
  const body = input.body?.trim() ?? "";
  const channel = (input.channel ?? "SMS").trim();
  if (!isAllowedChannel(channel)) {
    return { error: { code: "invalid_channel", status: 400 } };
  }
  // A picture with no words is a whole text; an email still needs a body.
  const attachments = channel === "Email" ? [] : cleanAttachments(input.attachments);
  if (!body && attachments.length === 0) return { error: { code: "empty_message", status: 400 } };
  if (channel === "Email" && !input.subject?.trim()) {
    return { error: { code: "subject_required", status: 400 } };
  }

  return ghlJson<SendResponse>(ctx, `/conversations/messages`, {
    method: "POST",
    body: JSON.stringify(
      buildMessage(contactId, channel, body, input.subject?.trim(), attachments),
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
      attachments?: unknown;
    }[];
  };
}

export interface ThreadMessage {
  id: string;
  body: string;
  direction: string;
  type: string;
  at: string;
  // Picture (or file) URLs on an MMS, both directions. Empty on a plain text.
  attachments?: string[];
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
  const seenIds = new Set<string>();
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
    for (const m of resp.messages?.messages ?? []) {
      // Dedupe by id in case a cursor page overlaps the previous one.
      if (m.id && seenIds.has(m.id)) continue;
      if (m.id) seenIds.add(m.id);
      raw.push(m);
    }
    const hasMore = Boolean(resp.messages?.nextPage);
    const nextCursor = resp.messages?.lastMessageId;
    // A missing or non-advancing cursor with nextPage=true would loop on the
    // same page forever; stop instead.
    if (!hasMore || !nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
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
      attachments: cleanAttachments(m.attachments),
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

// The one-line preview under a name in an inbox list. A picture text has no
// body, which used to read "No recent message" (Jake, 2026-10-12): an empty
// text says which way the photo went instead. Empty for system activity, and
// for anything that is not a text (a call has no body either).
export function conversationPreview(c: {
  lastMessageBody?: string;
  lastMessageType?: string | number;
  lastMessageDirection?: string;
}): string {
  const raw = typeof c.lastMessageType === "string" ? c.lastMessageType.toUpperCase() : "";
  if (raw.includes("ACTIVITY") || raw.includes("OPPORTUNITY")) return "";
  const body = (c.lastMessageBody ?? "").trim();
  if (body) return c.lastMessageBody ?? "";
  if (normalizeMessageType({ type: c.lastMessageType }) !== "SMS") return "";
  const dir = (c.lastMessageDirection ?? "").toLowerCase();
  if (dir === "outbound") return "Photo Sent";
  if (dir === "inbound") return "Photo Received";
  return "Photo";
}
