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

interface ShapedMessage {
  type: string;
  direction: string;
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
