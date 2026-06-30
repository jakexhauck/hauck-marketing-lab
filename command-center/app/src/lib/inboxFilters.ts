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
export type ChannelKey = "sms" | "email" | "ig" | "messenger" | "other";

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
  { key: "ig", label: "Instagram", icon: "📷" },
  { key: "messenger", label: "Messenger", icon: "💬" },
  { key: "other", label: "Other", icon: "📥" },
];

export const ORIGIN_BY_KEY = Object.fromEntries(
  ORIGINS.map((o) => [o.key, o]),
) as Record<OriginKey, OriginMeta>;
export const CHANNEL_BY_KEY = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c]),
) as Record<ChannelKey, ChannelMeta>;

export function channelFromType(raw: string | null | undefined): ChannelKey {
  const key = (raw ?? "")
    .toLowerCase()
    .replace(/^type[_-]?/, "")
    .replace(/[^a-z]/g, "");
  if (!key) return "other";
  if (key.includes("instagram") || key === "ig") return "ig";
  if (key.includes("messenger") || key.includes("facebook") || key === "fb")
    return "messenger";
  if (key.includes("email")) return "email";
  if (key.includes("sms") || key.includes("text")) return "sms";
  return "other";
}

// Resilient accessors: trust the server field, else derive / default.
export function convChannel(c: ApiConversation): ChannelKey {
  return c.channel ?? channelFromType(c.lastMessageType);
}
export function convOrigin(c: ApiConversation): OriginKey {
  return c.origin ?? "other";
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
    ig: 0,
    messenger: 0,
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
