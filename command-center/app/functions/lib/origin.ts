// Lead origin + channel classification. Pure, no GHL calls. Mirror of the
// unions in src/lib/inboxFilters.ts; keep both in sync.

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

// Ordered: first match wins. The haystack is the contact source plus every
// tag, lowercased and space-joined. react and call sit first because a
// reactivation/call lead can also carry a form/social source string.
export const ORIGIN_RULES: { key: OriginKey; test: RegExp }[] = [
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

export function normalizeChannel(raw: string | null | undefined): ChannelKey {
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
