// Unified Inbox filter config + pure helpers. Mirror of the unions in
// functions/lib/origin.ts; keep both in sync.
import type { ApiConversation } from "./api";

export type OriginKey =
  | "form"
  | "chat"
  | "paid"
  | "react"
  | "call"
  | "social"
  | "other";
// The inbox surfaces SMS and email only. Instagram, Messenger and anything else
// fold to "other" and are not shown as inbox conversations.
export type ChannelKey = "sms" | "email" | "other";

export interface OriginMeta {
  key: OriginKey;
  label: string;
  icon: string;
  swatch: string; // functional badge color; the one allowed non-token color
}
export interface ChannelMeta {
  key: ChannelKey;
  label: string;
  icon: string;
}

export const ORIGINS: OriginMeta[] = [
  { key: "form", label: "Estimate Form", icon: "📝", swatch: "#4f46e5" },
  { key: "chat", label: "Chat Widget", icon: "💬", swatch: "#0d9488" },
  { key: "paid", label: "Paid Ad", icon: "📣", swatch: "#2563eb" },
  { key: "react", label: "Reactivation", icon: "🔄", swatch: "#d97706" },
  { key: "call", label: "Inbound Call", icon: "📞", swatch: "#16a34a" },
  { key: "social", label: "Social DM", icon: "📷", swatch: "#db2777" },
  { key: "other", label: "Other", icon: "•", swatch: "#94a3b8" },
];

export const CHANNELS: ChannelMeta[] = [
  { key: "sms", label: "SMS", icon: "💬" },
  { key: "email", label: "Email", icon: "✉" },
  { key: "other", label: "Other", icon: "📥" },
];

// The message-type casing GHL uses for a channel key. Threads and composers
// compare against message `type` values ("SMS" / "Email"), so this seeds the
// active channel from a page's channel key.
export function channelKeyToType(key: ChannelKey): string {
  return key === "email" ? "Email" : "SMS";
}

export const ORIGIN_BY_KEY = Object.fromEntries(
  ORIGINS.map((o) => [o.key, o]),
) as Record<OriginKey, OriginMeta>;
export const CHANNEL_BY_KEY = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c]),
) as Record<ChannelKey, ChannelMeta>;

// Client mirror of ORIGIN_RULES in functions/lib/origin.ts; keep both in sync.
// Ordered, first match wins. react/call sit first because those leads can also
// carry a form/social source string. Used to badge a contact by where it came
// from, since ApiContact carries a raw source + tags but no server origin.
const ORIGIN_RULES: { key: OriginKey; test: RegExp }[] = [
  { key: "react", test: /reactivat|win[\s-]?back|dormant/ },
  { key: "call", test: /inbound call|phone call|missed call|\bcall\b|\bcaller\b/ },
  { key: "chat", test: /chat ?widget|live ?chat|website chat|webchat/ },
  { key: "form", test: /website form|estimate|contact form|quote request|\bform\b/ },
  {
    key: "paid",
    test: /paid|\bads?\b|facebook ad|instagram ad|google ad|adwords|ppc|utm|campaign/,
  },
  { key: "social", test: /instagram|facebook|messenger|\big\b|\bfb\b|social/ },
];

export function classifyOrigin(
  source: string | null | undefined,
  tags: string[] | undefined,
): OriginKey {
  const hay = [source ?? "", ...(tags ?? [])].join(" ").toLowerCase().trim();
  if (!hay) return "other";
  for (const rule of ORIGIN_RULES) if (rule.test.test(hay)) return rule.key;
  return "other";
}

export function channelFromType(raw: string | null | undefined): ChannelKey {
  const key = (raw ?? "")
    .toLowerCase()
    .replace(/^type[_-]?/, "")
    .replace(/[^a-z]/g, "");
  if (!key) return "other";
  if (key.includes("email")) return "email";
  if (key.includes("sms") || key.includes("text")) return "sms";
  // Instagram, Messenger, Facebook, WhatsApp, calls and anything else are not
  // inbox channels: fold them to "other" so they never surface as SMS or email.
  return "other";
}

// Resilient accessors: trust the server field, else derive / default.
export function convChannel(c: ApiConversation): ChannelKey {
  return c.channel ?? channelFromType(c.lastMessageType);
}
export function convOrigin(c: ApiConversation): OriginKey {
  return c.origin ?? "other";
}

// True for the conversations the inbox shows: SMS and email only. IG/Messenger
// (and anything that folds to "other") are dropped so the two channel pages
// never list them.
export function isInboxConversation(c: ApiConversation): boolean {
  const ch = convChannel(c);
  return ch === "sms" || ch === "email";
}

// The other inbox channel a contact is also reached on, or null. Given the full
// (unfiltered) conversations list, it returns "email" when viewing SMS (and the
// contact also has an email conversation) or vice versa. Null when the contact
// is only on the current channel, so the both-channel note is never fabricated.
export function otherInboxChannel(
  items: ApiConversation[],
  contactId: string,
  current: ChannelKey,
): ChannelKey | null {
  const other: ChannelKey = current === "email" ? "sms" : "email";
  const present = items.some(
    (c) => c.contactId === contactId && convChannel(c) === other,
  );
  return present ? other : null;
}

export interface InboxFilter {
  channel: ChannelKey | "all";
  source: OriginKey | "all";
  search: string;
}

export function filterConversations(
  items: ApiConversation[],
  f: InboxFilter,
): ApiConversation[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((c) => {
    if (f.channel !== "all" && convChannel(c) !== f.channel) return false;
    if (f.source !== "all" && convOrigin(c) !== f.source) return false;
    if (q) {
      const hit =
        c.name.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

export function countByChannel(
  items: ApiConversation[],
): Record<ChannelKey, number> {
  const out: Record<ChannelKey, number> = {
    sms: 0,
    email: 0,
    other: 0,
  };
  for (const c of items) out[convChannel(c)] += 1;
  return out;
}

export function countByOrigin(
  items: ApiConversation[],
): Record<OriginKey, number> {
  const out: Record<OriginKey, number> = {
    form: 0,
    chat: 0,
    paid: 0,
    react: 0,
    call: 0,
    social: 0,
    other: 0,
  };
  for (const c of items) out[convOrigin(c)] += 1;
  return out;
}
