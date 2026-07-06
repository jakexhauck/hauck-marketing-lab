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
// The inbox is SMS + Email only. Instagram / Messenger and anything else fold to
// "other" so the inbox never surfaces them as channels. Mirror of the union in
// functions/lib/origin.ts; keep both in sync.
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

// Only the two first-class inbox channels are presented. Everything else
// (Instagram, Messenger, unknown) normalizes to "other" and is not shown.
export const CHANNELS: ChannelMeta[] = [
  { key: "sms", label: "SMS", icon: "💬" },
  { key: "email", label: "Email", icon: "✉" },
];

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
  // Instagram, Messenger, Facebook and every other medium fold to "other": the
  // inbox only surfaces SMS and Email.
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
    other: 0,
  };
  for (const c of items) out[convChannel(c)] += 1;
  return out;
}

// ---- Per-page (SMS / Email) inbox helpers ----
// The inbox splits into an SMS page and an Email page. These helpers derive the
// active page channel from the route and slice the list to it.
export type PageChannel = "sms" | "email";
export const PAGE_CHANNELS: PageChannel[] = ["sms", "email"];

// The composer channel label for a page channel (matches ChannelComposer's
// vocabulary of "SMS" / "Email").
export function sendLabelForChannel(ch: PageChannel): string {
  return ch === "email" ? "Email" : "SMS";
}
export function otherPageChannel(ch: PageChannel): PageChannel {
  return ch === "sms" ? "email" : "sms";
}
// The active page channel from a list route (/conversations/email vs /sms).
export function pageChannelFromPath(pathname: string): PageChannel {
  return pathname.endsWith("/email") ? "email" : "sms";
}
// The page channel from the detail route's ?ch= param (null if absent/invalid).
export function pageChannelFromParam(
  raw: string | null | undefined,
): PageChannel | null {
  return raw === "email" ? "email" : raw === "sms" ? "sms" : null;
}
// Narrow a conversation's channel to a page channel, or null if it lives on
// neither page (e.g. an "other" medium that the inbox does not surface).
export function pageChannelOf(c: ApiConversation): PageChannel | null {
  const ch = convChannel(c);
  return ch === "sms" || ch === "email" ? ch : null;
}

// The single-select filter for a channel page: needs-reply, all, or a lead
// source. Replaces the old per-channel smart views (the page is already scoped
// to one channel, so it slices by where the lead came from instead).
export type InboxView = "needs" | "all" | OriginKey;

export function applyInboxView(
  items: ApiConversation[],
  view: InboxView,
): ApiConversation[] {
  if (view === "needs") return items.filter((c) => c.unreadCount > 0);
  if (view === "all") return items;
  return items.filter((c) => convOrigin(c) === view);
}

// Needs-reply sorts longest-wait-first (oldest last message on top); the browse
// views read newest-first like a normal inbox.
export function sortForInboxView(
  list: ApiConversation[],
  view: InboxView,
): ApiConversation[] {
  const asc = view === "needs";
  return [...list].sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return asc ? ta - tb : tb - ta;
  });
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
