# Unified Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-column desktop Inbox with the three-pane Unified Inbox from `mockups/unified-inbox/unified-inbox.html`: a Channel + Source filter rail, a conversation list with source badges, and an inline detail pane with an origin-context strip.

**Architecture:** The backend `/api/conversations` endpoint joins each contact's `source` + `tags` onto its conversation and classifies it into one of seven origin categories. The frontend rebuilds `ConversationsDesktop` as a three-pane layout that filters on two independent dimensions (channel + source) and renders the selected conversation inline, reusing the existing `ConversationThread` + `MessageComposer`. The phone list is untouched except for a new source badge.

**Tech Stack:** React + TypeScript, React Query, Tailwind (app design tokens in `src/index.css`), Cloudflare Pages Functions (GHL), Vitest.

## Global Constraints

- **No em dashes (`—`)** anywhere: code, comments, UI copy, docs. Use commas, periods, parentheses, or colons.
- **Design tokens only**, never raw hex from the mockup, for structural color: `var(--brand-primary)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--faint)`. The mockup palette already equals these tokens (Modern Motion). The functional per-source swatch colors are the one exception and live in `ORIGINS`.
- **Fonts:** display = `font-display` (Poppins), body = default (Inter). Already wired globally.
- **Origin classification is heuristic and config-driven.** Unknown sources fall to `"other"`. The rule list is the single place to correct it.
- **Resilience:** the frontend must work if the server omits `channel`/`origin` (e.g. an older response). Derive channel from `lastMessageType` and default origin to `"other"` when the fields are absent.
- **Vitest only scans `src/**/*.test.ts`** (see `vitest.config.ts`). Backend pure logic that needs a test is therefore covered by mirroring its behaviour in a `src`-side test, OR by widening the include (Task 1 widens it).

---

## File Structure

**Create**
- `command-center/app/functions/lib/origin.ts` — pure `classifyOrigin` + `normalizeChannel` + key unions (server side).
- `command-center/app/functions/lib/origin.test.ts` — unit tests for the classifier.
- `command-center/app/src/lib/inboxFilters.ts` — frontend display config (`ORIGINS`, `CHANNELS`), pure `filterConversations`, `channelFromType`, count helpers, key unions.
- `command-center/app/src/lib/inboxFilters.test.ts` — unit tests for filtering + counts.
- `command-center/app/src/components/conversations/SourceBadge.tsx` — the colored source pill, shared by desktop list, mobile row, and the origin strip.
- `command-center/app/src/components/conversations/InboxFilterRail.tsx` — the Channel + Source filter rail.
- `command-center/app/src/components/conversations/InboxDetail.tsx` — the inline detail pane (header + origin strip + thread + composer).
- `command-center/app/docs/connections/unified-inbox.md` — the connections backlog doc.

**Modify**
- `command-center/app/functions/lib/ghl.ts` — extract a shared `fetchAllContacts` helper.
- `command-center/app/functions/api/contacts.ts` — use `fetchAllContacts`.
- `command-center/app/functions/api/conversations/index.ts` — join + classify; add fields to `ApiConversation`.
- `command-center/app/src/lib/api.ts` — add `channel`, `origin`, `source`, `firstTouchAt` to `ApiConversation`.
- `command-center/app/src/components/desktop/DesktopPage.tsx` — add a `flush` prop for full-bleed surfaces.
- `command-center/app/src/components/conversations/ConversationsDesktop.tsx` — rebuild as the three-pane inbox.
- `command-center/app/src/routes/Conversations.tsx` — add the source badge to the phone `ConversationRow`.
- `command-center/app/src/demo/data.ts` — seed varied channel + source on demo conversations.
- `command-center/app/vitest.config.ts` — include `functions/**/*.test.ts`.

---

## Shared contracts (used across tasks)

```ts
// Origin = where the lead came from. Channel = the medium of the last message.
type OriginKey = "form" | "chat" | "paid" | "react" | "call" | "social" | "other";
type ChannelKey = "sms" | "email" | "ig" | "messenger" | "other";
```

These two unions are duplicated intentionally: once in `functions/lib/origin.ts` (server) and once in `src/lib/inboxFilters.ts` (client), so the two trees stay decoupled. They must stay in sync; both files carry a comment pointing at the other.

`ApiConversation` (after Task 3) gains:
```ts
channel: ChannelKey;     // normalized from lastMessageType
origin: OriginKey;       // classified from contact source + tags
source: string;          // raw GHL contact.source, for the strip tooltip
firstTouchAt: string;    // contact.dateAdded ISO, for "first touch" in the strip
```

---

### Task 1: Origin classifier (server pure logic)

**Files:**
- Create: `command-center/app/functions/lib/origin.ts`
- Create: `command-center/app/functions/lib/origin.test.ts`
- Modify: `command-center/app/vitest.config.ts`

**Interfaces:**
- Produces: `classifyOrigin(source: string | null | undefined, tags: string[] | undefined): OriginKey`, `normalizeChannel(raw: string | null | undefined): ChannelKey`, and the exported `OriginKey` / `ChannelKey` unions and `ORIGIN_RULES`.

- [ ] **Step 1: Widen the vitest include**

`command-center/app/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "functions/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

`command-center/app/functions/lib/origin.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { classifyOrigin, normalizeChannel } from "./origin";

describe("classifyOrigin", () => {
  it("maps website form sources to form", () => {
    expect(classifyOrigin("Website Form", [])).toBe("form");
    expect(classifyOrigin("Estimate Request", [])).toBe("form");
  });
  it("maps chat widget sources to chat", () => {
    expect(classifyOrigin("Chat Widget", [])).toBe("chat");
    expect(classifyOrigin("website chat", [])).toBe("chat");
  });
  it("maps ad / utm sources to paid", () => {
    expect(classifyOrigin("Facebook Ad", [])).toBe("paid");
    expect(classifyOrigin("utm_campaign spring", [])).toBe("paid");
  });
  it("maps reactivation tags to react before anything else", () => {
    expect(classifyOrigin("Website Form", ["reactivation"])).toBe("react");
    expect(classifyOrigin("", ["win-back"])).toBe("react");
  });
  it("maps inbound call sources to call", () => {
    expect(classifyOrigin("Inbound Call", [])).toBe("call");
  });
  it("maps plain social sources to social, not paid", () => {
    expect(classifyOrigin("Instagram", [])).toBe("social");
    expect(classifyOrigin("Facebook", [])).toBe("social");
  });
  it("falls back to other for empty or unknown", () => {
    expect(classifyOrigin("", [])).toBe("other");
    expect(classifyOrigin("Manual", [])).toBe("other");
    expect(classifyOrigin(null, undefined)).toBe("other");
  });
});

describe("normalizeChannel", () => {
  it("normalizes GHL message types", () => {
    expect(normalizeChannel("TYPE_SMS")).toBe("sms");
    expect(normalizeChannel("Email")).toBe("email");
    expect(normalizeChannel("Instagram")).toBe("ig");
    expect(normalizeChannel("Facebook")).toBe("messenger");
    expect(normalizeChannel("")).toBe("other");
    expect(normalizeChannel(null)).toBe("other");
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd command-center/app && npx vitest run functions/lib/origin.test.ts`
Expected: FAIL, cannot resolve `./origin`.

- [ ] **Step 4: Implement**

`command-center/app/functions/lib/origin.ts`:
```ts
// Lead origin + channel classification. Pure, no GHL calls. Mirror of the
// unions in src/lib/inboxFilters.ts; keep both in sync.

export type OriginKey =
  | "form" | "chat" | "paid" | "react" | "call" | "social" | "other";
export type ChannelKey = "sms" | "email" | "ig" | "messenger" | "other";

// Ordered: first match wins. The haystack is the contact source plus every
// tag, lowercased and space-joined. react and call sit first because a
// reactivation/call lead can also carry a form/social source string.
export const ORIGIN_RULES: { key: OriginKey; test: RegExp }[] = [
  { key: "react", test: /reactivat|win[\s-]?back|dormant/ },
  { key: "call", test: /inbound call|phone call|missed call|\bcall\b|\bcaller\b/ },
  { key: "chat", test: /chat ?widget|live ?chat|website chat|webchat/ },
  { key: "form", test: /website form|estimate|contact form|quote request|\bform\b/ },
  { key: "paid", test: /paid|\bads?\b|facebook ad|instagram ad|google ad|adwords|ppc|utm|campaign/ },
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
  if (key.includes("instagram") || key === "ig") return "ig";
  if (key.includes("messenger") || key.includes("facebook") || key === "fb")
    return "messenger";
  if (key.includes("email")) return "email";
  if (key.includes("sms") || key.includes("text")) return "sms";
  return "other";
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd command-center/app && npx vitest run functions/lib/origin.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/lib/origin.ts command-center/app/functions/lib/origin.test.ts command-center/app/vitest.config.ts
git commit -m "feat(inbox): add origin + channel classifier"
```

---

### Task 2: Bulk-contacts helper (server refactor)

**Files:**
- Modify: `command-center/app/functions/lib/ghl.ts`
- Modify: `command-center/app/functions/api/contacts.ts`

**Interfaces:**
- Produces: `fetchAllContacts(ctx: GhlContext, opts?: { maxPages?: number }): Promise<GhlContactRecord[]>` where `GhlContactRecord = { id: string; contactName?: string; firstName?: string; lastName?: string; email?: string; phone?: string; dateAdded?: string; dateUpdated?: string; tags?: string[]; source?: string }`.
- Consumes: nothing new.

- [ ] **Step 1: Add the type + helper to `ghl.ts`**

Append to `command-center/app/functions/lib/ghl.ts`:
```ts
export interface GhlContactRecord {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
  dateUpdated?: string;
  tags?: string[];
  source?: string;
}

interface ContactsPage {
  contacts?: GhlContactRecord[];
  meta?: { total?: number; nextPageUrl?: string };
}

// Paginated fetch of every contact for a location (id, source, tags, dates).
// Shared by the Contacts surface and the Unified Inbox source join.
export async function fetchAllContacts(
  ctx: GhlContext,
  opts: { maxPages?: number } = {},
): Promise<GhlContactRecord[]> {
  const maxPages = opts.maxPages ?? 10;
  const all: GhlContactRecord[] = [];
  const seen = new Set<string>();
  let url = `/contacts/?locationId=${encodeURIComponent(ctx.locationId)}&limit=100`;
  let pageCount = 0;
  while (url && pageCount < maxPages) {
    const data = await ghlJson<ContactsPage>(ctx, url);
    const page = data.contacts ?? [];
    for (const c of page) {
      if (c.id && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }
    const next = data.meta?.nextPageUrl;
    if (!next || page.length === 0) break;
    url = next;
    pageCount += 1;
  }
  return all;
}
```
(If `GhlContext` is named differently in `ghl.ts`, match the local name used by `fetchAllConversations`.)

- [ ] **Step 2: Use the helper in `contacts.ts`**

Replace the inline pagination loop in `command-center/app/functions/api/contacts.ts` with:
```ts
import type { Env, ApiData } from "../lib/env";
import { fetchAllContacts, type GhlContactRecord } from "../lib/ghl";

export interface ApiContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
}

function shapeContact(c: GhlContactRecord): ApiContact {
  const fullName =
    c.contactName ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Unknown";
  const created = c.dateAdded ?? new Date().toISOString();
  return {
    id: c.id,
    name: fullName,
    phone: c.phone ?? "",
    email: c.email ?? "",
    source: c.source ?? "",
    tags: c.tags ?? [],
    createdAt: created,
    lastActivityAt: c.dateUpdated ?? created,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const all = await fetchAllContacts({
    token: t.ghl_token,
    locationId: t.ghl_location_id,
  });
  const contacts = all.map(shapeContact);
  contacts.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );
  return Response.json({ contacts, total: contacts.length });
};
```

- [ ] **Step 3: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit -p functions/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/lib/ghl.ts command-center/app/functions/api/contacts.ts
git commit -m "refactor(api): extract fetchAllContacts helper"
```

---

### Task 3: Enrich the conversations endpoint

**Files:**
- Modify: `command-center/app/functions/api/conversations/index.ts`
- Modify: `command-center/app/src/lib/api.ts`

**Interfaces:**
- Consumes: `fetchAllContacts` (Task 2), `classifyOrigin`, `normalizeChannel` (Task 1).
- Produces: enriched `ApiConversation` with `channel`, `origin`, `source`, `firstTouchAt`.

- [ ] **Step 1: Extend the frontend type**

`command-center/app/src/lib/api.ts`, `ApiConversation`:
```ts
export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
  // Unified Inbox: medium of the last message + where the lead came from.
  // Optional so older payloads and demo data without them still type-check;
  // the UI derives channel from lastMessageType and defaults origin to "other".
  channel?: "sms" | "email" | "ig" | "messenger" | "other";
  origin?: "form" | "chat" | "paid" | "react" | "call" | "social" | "other";
  source?: string;
  firstTouchAt?: string;
}
```

- [ ] **Step 2: Enrich the endpoint**

`command-center/app/functions/api/conversations/index.ts`:
```ts
import type { Env, ApiData } from "../../lib/env";
import { fetchAllConversations, fetchAllContacts } from "../../lib/ghl";
import { classifyOrigin, normalizeChannel } from "../../lib/origin";
import type { OriginKey, ChannelKey } from "../../lib/origin";

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
  channel: ChannelKey;
  origin: OriginKey;
  source: string;
  firstTouchAt: string;
}

function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // Conversations + the contact roster (for source/tags), fetched in parallel.
  const [all, contacts] = await Promise.all([
    fetchAllConversations(gctx),
    fetchAllContacts(gctx),
  ]);

  const byContact = new Map(contacts.map((c) => [c.id, c]));

  const items = all
    .filter((c) => Boolean(c.contactId))
    .map((c) => {
      const contact = byContact.get(c.contactId as string);
      const name = c.fullName || c.contactName || c.email || c.phone || "Unknown";
      const previewRaw = c.lastMessageBody ?? "";
      const preview = isSystemActivity(c.lastMessageType) ? "" : previewRaw;
      const atMs =
        typeof c.lastMessageDate === "number"
          ? c.lastMessageDate
          : c.lastMessageDate
            ? +new Date(c.lastMessageDate)
            : NaN;
      const lastType =
        typeof c.lastMessageType === "string" ? c.lastMessageType : "";
      return {
        id: c.id,
        contactId: c.contactId as string,
        name,
        preview,
        lastMessageType: lastType,
        lastMessageAt: Number.isFinite(atMs)
          ? new Date(atMs).toISOString()
          : new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
        channel: normalizeChannel(lastType),
        origin: classifyOrigin(contact?.source, contact?.tags),
        source: contact?.source ?? "",
        firstTouchAt: contact?.dateAdded ?? "",
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};
```

- [ ] **Step 3: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit -p functions/tsconfig.json && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/conversations/index.ts command-center/app/src/lib/api.ts
git commit -m "feat(inbox): join contact source + channel onto conversations"
```

---

### Task 4: Frontend filter config + pure filtering

**Files:**
- Create: `command-center/app/src/lib/inboxFilters.ts`
- Create: `command-center/app/src/lib/inboxFilters.test.ts`

**Interfaces:**
- Produces:
  - `OriginKey`, `ChannelKey` unions.
  - `ORIGINS: OriginMeta[]`, `CHANNELS: ChannelMeta[]`, `ORIGIN_BY_KEY`, `CHANNEL_BY_KEY`.
  - `channelFromType(raw: string | null | undefined): ChannelKey`
  - `convChannel(c: ApiConversation): ChannelKey` and `convOrigin(c: ApiConversation): OriginKey` (resilient accessors).
  - `filterConversations(items, { channel, source, search }): ApiConversation[]` where `channel: ChannelKey | "all"`, `source: OriginKey | "all"`, `search: string`.
  - `countByChannel(items): Record<ChannelKey, number>`, `countByOrigin(items): Record<OriginKey, number>`.

- [ ] **Step 1: Write the failing test**

`command-center/app/src/lib/inboxFilters.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  channelFromType,
  convOrigin,
  filterConversations,
  countByChannel,
} from "./inboxFilters";
import type { ApiConversation } from "./api";

function conv(p: Partial<ApiConversation>): ApiConversation {
  return {
    id: "c", contactId: "x", name: "Jane Doe", preview: "hi",
    lastMessageType: "TYPE_SMS", lastMessageAt: "", unreadCount: 0,
    ...p,
  };
}

describe("channelFromType", () => {
  it("derives a channel when the field is missing", () => {
    expect(channelFromType("TYPE_SMS")).toBe("sms");
    expect(channelFromType("Email")).toBe("email");
  });
});

describe("convOrigin", () => {
  it("uses the server field, defaults to other", () => {
    expect(convOrigin(conv({ origin: "form" }))).toBe("form");
    expect(convOrigin(conv({ origin: undefined }))).toBe("other");
  });
});

describe("filterConversations", () => {
  const items = [
    conv({ id: "1", name: "Sarah", channel: "sms", origin: "form" }),
    conv({ id: "2", name: "Ryan", channel: "email", origin: "chat" }),
    conv({ id: "3", name: "Dana", channel: "sms", origin: "paid" }),
  ];
  it("filters by channel", () => {
    expect(filterConversations(items, { channel: "sms", source: "all", search: "" }).map(c => c.id))
      .toEqual(["1", "3"]);
  });
  it("filters by source", () => {
    expect(filterConversations(items, { channel: "all", source: "chat", search: "" }).map(c => c.id))
      .toEqual(["2"]);
  });
  it("filters by channel and source together", () => {
    expect(filterConversations(items, { channel: "sms", source: "paid", search: "" }).map(c => c.id))
      .toEqual(["3"]);
  });
  it("filters by search over name and preview", () => {
    expect(filterConversations(items, { channel: "all", source: "all", search: "ryan" }).map(c => c.id))
      .toEqual(["2"]);
  });
});

describe("countByChannel", () => {
  it("counts using the resilient accessor", () => {
    const counts = countByChannel([
      conv({ channel: "sms" }),
      conv({ channel: "sms" }),
      conv({ channel: "email" }),
      conv({ lastMessageType: "TYPE_SMS", channel: undefined }),
    ]);
    expect(counts.sms).toBe(3);
    expect(counts.email).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/inboxFilters.test.ts`
Expected: FAIL, cannot resolve `./inboxFilters`.

- [ ] **Step 3: Implement**

`command-center/app/src/lib/inboxFilters.ts`:
```ts
// Unified Inbox filter config + pure helpers. Mirror of the unions in
// functions/lib/origin.ts; keep both in sync.
import type { ApiConversation } from "./api";

export type OriginKey =
  | "form" | "chat" | "paid" | "react" | "call" | "social" | "other";
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
  const out = { sms: 0, email: 0, ig: 0, messenger: 0, other: 0 };
  for (const c of items) out[convChannel(c)] += 1;
  return out;
}

export function countByOrigin(
  items: ApiConversation[],
): Record<OriginKey, number> {
  const out = {
    form: 0, chat: 0, paid: 0, react: 0, call: 0, social: 0, other: 0,
  };
  for (const c of items) out[convOrigin(c)] += 1;
  return out;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd command-center/app && npx vitest run src/lib/inboxFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/inboxFilters.ts command-center/app/src/lib/inboxFilters.test.ts
git commit -m "feat(inbox): filter config + pure filtering helpers"
```

---

### Task 5: SourceBadge component

**Files:**
- Create: `command-center/app/src/components/conversations/SourceBadge.tsx`

**Interfaces:**
- Consumes: `ORIGIN_BY_KEY`, `OriginKey`, `convOrigin` from `inboxFilters`.
- Produces: `default function SourceBadge({ origin, size }: { origin: OriginKey; size?: "sm" | "md" }): JSX.Element`.

- [ ] **Step 1: Implement**

`command-center/app/src/components/conversations/SourceBadge.tsx`:
```tsx
import { ORIGIN_BY_KEY, type OriginKey } from "../../lib/inboxFilters";

// The colored "where they came from" pill. Functional swatch color (from
// ORIGINS) tinted for the fill; this is the one place non-token color is ok.
export default function SourceBadge({
  origin,
  size = "md",
}: {
  origin: OriginKey;
  size?: "sm" | "md";
}) {
  const meta = ORIGIN_BY_KEY[origin] ?? ORIGIN_BY_KEY.other;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10.5px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad}`}
      style={{
        background: `color-mix(in srgb, ${meta.swatch} 14%, transparent)`,
        color: meta.swatch,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/conversations/SourceBadge.tsx
git commit -m "feat(inbox): SourceBadge pill"
```

---

### Task 6: DesktopPage `flush` prop

**Files:**
- Modify: `command-center/app/src/components/desktop/DesktopPage.tsx`

**Interfaces:**
- Produces: `DesktopPage` accepts optional `flush?: boolean`. When true the content area drops the centered `max-w` + padding and fills remaining height with no page scroll (children own their scroll regions).

- [ ] **Step 1: Implement**

In `command-center/app/src/components/desktop/DesktopPage.tsx`, add `flush` to the props type and branch the root + content wrapper:
```tsx
export default function DesktopPage({
  title,
  subtitle,
  actions,
  children,
  flush = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  const { session } = useAuth();
  return (
    <div
      className={
        "flex flex-1 flex-col " + (flush ? "overflow-hidden" : "overflow-y-auto")
      }
    >
      <header className="glass sticky top-0 z-10 flex items-center gap-4 border-b border-white/50 px-9 py-4 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight text-text">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <GlobalSearch />
        {actions && (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        )}
        <ChatLauncher />
        <NotificationBell enabled={Boolean(session)} variant="surface" />
        <AvatarMenu />
      </header>
      {flush ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        <div className="fx-rise mx-auto w-full max-w-[1220px] px-9 py-7">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (existing callers still pass, prop is optional)**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/desktop/DesktopPage.tsx
git commit -m "feat(desktop): flush prop for full-bleed surfaces"
```

---

### Task 7: Filter rail component

**Files:**
- Create: `command-center/app/src/components/conversations/InboxFilterRail.tsx`

**Interfaces:**
- Consumes: `CHANNELS`, `ORIGINS`, `ChannelKey`, `OriginKey` from `inboxFilters`; `countByChannel`, `countByOrigin`.
- Produces:
  ```ts
  function InboxFilterRail(props: {
    items: ApiConversation[];
    channel: ChannelKey | "all";
    source: OriginKey | "all";
    onChannel: (c: ChannelKey | "all") => void;
    onSource: (s: OriginKey | "all") => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Implement**

`command-center/app/src/components/conversations/InboxFilterRail.tsx`:
```tsx
import {
  CHANNELS,
  ORIGINS,
  countByChannel,
  countByOrigin,
  filterConversations,
  type ChannelKey,
  type OriginKey,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

export default function InboxFilterRail({
  items,
  channel,
  source,
  onChannel,
  onSource,
}: {
  items: ApiConversation[];
  channel: ChannelKey | "all";
  source: OriginKey | "all";
  onChannel: (c: ChannelKey | "all") => void;
  onSource: (s: OriginKey | "all") => void;
}) {
  // Channel counts use the full set; source counts respect the active channel
  // so the source list reflects what is actually reachable.
  const channelCounts = countByChannel(items);
  const inChannel = filterConversations(items, { channel, source: "all", search: "" });
  const originCounts = countByOrigin(inChannel);

  const rowBase =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors";
  const on = "bg-brand-tint text-brand-text font-semibold";
  const off = "text-muted hover:bg-surface-2";

  return (
    <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
      <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">
        Channel
      </div>
      <button className={`${rowBase} ${channel === "all" ? on : off}`} onClick={() => onChannel("all")}>
        <span aria-hidden>📥</span> All channels
        <span className="ml-auto text-[11px] font-semibold text-faint">{items.length}</span>
      </button>
      {CHANNELS.filter((c) => c.key !== "other" || channelCounts.other > 0).map((c) => (
        <button key={c.key} className={`${rowBase} ${channel === c.key ? on : off}`} onClick={() => onChannel(c.key)}>
          <span aria-hidden>{c.icon}</span> {c.label}
          <span className="ml-auto text-[11px] font-semibold text-faint">{channelCounts[c.key]}</span>
        </button>
      ))}

      <div className="mt-4 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">
        Source
      </div>
      <button className={`${rowBase} ${source === "all" ? on : off}`} onClick={() => onSource("all")}>
        <span className="h-2.5 w-2.5 rounded-[3px] bg-faint" aria-hidden /> All sources
        <span className="ml-auto text-[11px] font-semibold text-faint">{inChannel.length}</span>
      </button>
      {ORIGINS.filter((o) => o.key !== "other" || originCounts.other > 0).map((o) => (
        <button key={o.key} className={`${rowBase} ${source === o.key ? on : off}`} onClick={() => onSource(o.key)}>
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: o.swatch }} aria-hidden />
          {o.label}
          <span className="ml-auto text-[11px] font-semibold text-faint">{originCounts[o.key]}</span>
        </button>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/conversations/InboxFilterRail.tsx
git commit -m "feat(inbox): channel + source filter rail"
```

---

### Task 8: Inline detail pane

**Files:**
- Create: `command-center/app/src/components/conversations/InboxDetail.tsx`

**Interfaces:**
- Consumes: `ConversationThread`, `MessageComposer`, `ChannelFilterProvider`, `Avatar`, `SourceBadge`, `convOrigin`, `convChannel`, `CHANNEL_BY_KEY`.
- Produces: `function InboxDetail({ conv }: { conv: ApiConversation | null }): JSX.Element`.

- [ ] **Step 1: Implement**

`command-center/app/src/components/conversations/InboxDetail.tsx`:
```tsx
import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import SourceBadge from "./SourceBadge";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import {
  CHANNEL_BY_KEY,
  convChannel,
  convOrigin,
  ORIGIN_BY_KEY,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

function firstTouchLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function InboxDetail({ conv }: { conv: ApiConversation | null }) {
  if (!conv) {
    return (
      <section className="flex flex-1 items-center justify-center bg-brand-bg">
        <p className="text-[13px] text-faint">Select a conversation to read it.</p>
      </section>
    );
  }

  const origin = convOrigin(conv);
  const channelMeta = CHANNEL_BY_KEY[convChannel(conv)];
  const originMeta = ORIGIN_BY_KEY[origin];
  const touch = firstTouchLabel(conv.firstTouchAt);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-brand-bg">
      <div className="border-b border-border bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={conv.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-semibold text-text">
              {conv.name}
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted">
              {channelMeta.icon} {channelMeta.label}
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-brand-primary/15 bg-brand-tint/50 px-3 py-2">
          <SourceBadge origin={origin} />
          <span className="text-[11.5px] text-muted">
            First touch via <b className="text-text">{originMeta.label}</b>
            {touch ? ` . ${touch}` : ""}
            {conv.source ? ` . ${conv.source}` : ""}
          </span>
        </div>
      </div>

      <ChannelFilterProvider key={conv.contactId}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-6 pb-3 pt-4">
          <ConversationThread contactId={conv.contactId} fill />
        </div>
        <div className="border-t border-border bg-surface px-6 py-3.5">
          <MessageComposer contactId={conv.contactId} />
        </div>
      </ChannelFilterProvider>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors. (If `ConversationThread`/`MessageComposer` prop names differ, match the usage in `ConversationDetailDesktop.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/conversations/InboxDetail.tsx
git commit -m "feat(inbox): inline detail pane with origin strip"
```

---

### Task 9: Rebuild ConversationsDesktop as the three-pane inbox

**Files:**
- Modify: `command-center/app/src/components/conversations/ConversationsDesktop.tsx`

**Interfaces:**
- Consumes: `InboxFilterRail`, `InboxDetail`, `SourceBadge`, `filterConversations`, `convOrigin`, `useConversationsQuery`, `DesktopPage`.

- [ ] **Step 1: Implement the three-pane layout**

Replace `command-center/app/src/components/conversations/ConversationsDesktop.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import DesktopPage from "../desktop/DesktopPage";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import InboxFilterRail from "./InboxFilterRail";
import InboxDetail from "./InboxDetail";
import SourceBadge from "./SourceBadge";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { timeAgo } from "../../lib/timeAgo";
import {
  convOrigin,
  filterConversations,
  type ChannelKey,
  type OriginKey,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

export default function ConversationsDesktop() {
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);

  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [source, setSource] = useState<OriginKey | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );

  const visible = useMemo(
    () => filterConversations(items, { channel, source, search }),
    [items, channel, source, search],
  );

  // Keep a valid selection: default to the first visible row, and re-pick when
  // filtering removes the current one.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((c) => c.contactId === selectedId)) {
      setSelectedId(visible[0].contactId);
    }
  }, [visible, selectedId]);

  const selected = visible.find((c) => c.contactId === selectedId) ?? null;

  const unreadTotal = items.reduce(
    (n, c) => n + (c.unreadCount > 0 ? c.unreadCount : 0),
    0,
  );
  const subtitle = query.isLoading
    ? "Loading..."
    : `${items.length} ${items.length === 1 ? "thread" : "threads"}, ${unreadTotal} unread`;

  return (
    <DesktopPage title="Inbox" subtitle={subtitle} flush>
      <div className="flex min-h-0 flex-1">
        <InboxFilterRail
          items={items}
          channel={channel}
          source={source}
          onChannel={setChannel}
          onSource={setSource}
        />

        {/* Conversation list */}
        <section className="flex w-[330px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pb-2 pt-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or message"
              aria-label="Search conversations"
              className="w-full rounded-[10px] border border-border bg-brand-bg px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {query.isError ? (
              <div className="m-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
                Failed to load conversations.
              </div>
            ) : query.isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" aria-hidden />
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                title="No conversations"
                message={
                  search.trim()
                    ? `No conversations match "${search.trim()}"`
                    : "Nothing matches these filters."
                }
              />
            ) : (
              <ul>
                {visible.map((c) => (
                  <li key={c.id}>
                    <ConvRow
                      conv={c}
                      now={now}
                      active={c.contactId === selectedId}
                      onOpen={() => setSelectedId(c.contactId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <InboxDetail conv={selected} />
      </div>
    </DesktopPage>
  );
}

function ConvRow({
  conv,
  now,
  active,
  onOpen,
}: {
  conv: ApiConversation;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "flex w-full gap-3 border-b border-divider px-4 py-3 text-left transition-colors " +
        (active
          ? "bg-brand-tint/60 shadow-[inset_3px_0_0_var(--brand-primary)]"
          : "hover:bg-surface-2")
      }
    >
      <Avatar name={conv.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate font-display text-[13px] " +
              (hasUnread ? "font-bold text-text" : "font-semibold text-text")
            }
          >
            {conv.name}
          </span>
          <span className="shrink-0 font-data text-[10.5px] text-faint tabular-nums">
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-faint">
          {conv.preview || "No recent message"}
        </div>
        <div className="mt-1.5">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
        </div>
      </div>
      {hasUnread && (
        <span className="ml-1 mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 font-data text-[10px] font-bold text-brand-fg tabular-nums">
          {conv.unreadCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + full test run**

Run: `cd command-center/app && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/conversations/ConversationsDesktop.tsx
git commit -m "feat(inbox): three-pane unified inbox layout"
```

---

### Task 10: Mobile source badge

**Files:**
- Modify: `command-center/app/src/routes/Conversations.tsx`

**Interfaces:**
- Consumes: `SourceBadge`, `convOrigin`.

- [ ] **Step 1: Add the badge to the phone row**

In `command-center/app/src/routes/Conversations.tsx`, import at the top:
```tsx
import SourceBadge from "../components/conversations/SourceBadge";
import { convOrigin } from "../lib/inboxFilters";
```
Then inside `ConversationRow`, in the line that renders `channel` next to the preview, add the source badge after the channel chip block (same flex row):
```tsx
        <div className="mt-0.5 flex items-center gap-2">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
          {channel && (
            <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--text-faint)]">
              {channel}
            </span>
          )}
          <div
            className={
              "min-w-0 flex-1 truncate text-xs " +
              (hasUnread
                ? "font-semibold text-[var(--text)]"
                : "text-[var(--text-faint)]")
            }
          >
            {conv.preview || (
              <span className="italic text-[var(--text-faint)]">
                No recent message
              </span>
            )}
          </div>
          {hasUnread && (
            <span
              className="ml-2 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/Conversations.tsx
git commit -m "feat(inbox): source badge on phone conversation rows"
```

---

### Task 11: Demo data variety

**Files:**
- Modify: `command-center/app/src/demo/data.ts`

**Interfaces:**
- Consumes: nothing new. Sets `channel`, `origin`, `source`, `firstTouchAt` on the demo conversations directly (the demo handler returns them verbatim).

- [ ] **Step 1: Vary the seeded conversation fields**

In `command-center/app/src/demo/data.ts`, at the `conversations.push({ ... })` call (around line 230), add the four fields, cycling through values by index so the rails show spread:
```ts
      const DEMO_CHANNELS = ["sms", "email", "ig", "messenger", "sms", "sms"] as const;
      const DEMO_ORIGINS = ["form", "chat", "paid", "react", "call", "social"] as const;
      conversations.push({
        id: `demo-conv-${i + 1}`,
        contactId,
        name,
        preview: lastMsg.body,
        lastMessageType: lastMsg.type,
        lastMessageAt: lastMsg.at,
        unreadCount: unread,
        channel: DEMO_CHANNELS[i % DEMO_CHANNELS.length],
        origin: DEMO_ORIGINS[i % DEMO_ORIGINS.length],
        source: DEMO_ORIGINS[i % DEMO_ORIGINS.length],
        firstTouchAt: new Date(createdAt).toISOString(),
      });
```
(Place the two `const` arrays once at the top of the generator function instead of inside the loop if the linter flags redefinition; behaviour is identical.)

- [ ] **Step 2: Typecheck + tests**

Run: `cd command-center/app && npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/demo/data.ts
git commit -m "feat(inbox): seed channel + source variety in demo data"
```

---

### Task 12: Connections doc

**Files:**
- Create: `command-center/app/docs/connections/unified-inbox.md`

- [ ] **Step 1: Write the doc** (see the template the task uses; mirror `estimate-forms.md` structure). It must record: the source/tags join that powers the Source rail, the heuristic origin classifier and how to correct it, the paid-vs-organic-social ambiguity and the UTM/attribution upgrade that resolves it, the inbound-message webhook for live refresh, and the per-action gating. Status markers: not wired / partial / live.

- [ ] **Step 2: Commit**

```bash
git add command-center/app/docs/connections/unified-inbox.md
git commit -m "docs(inbox): unified inbox connections backlog"
```

---

### Task 13: Verify, ship, clean up

- [ ] **Step 1: Build + full test**

Run: `cd command-center/app && npm run build && npx vitest run`
Expected: build succeeds, all tests pass.

- [ ] **Step 2: Visual proof (M9)** Run the app, sign in (or demo mode), open `/conversations` on a desktop width. Confirm: three panes; channel + source filters change counts and list; clicking a row opens the thread inline with the origin strip; composer sends. Screenshot.

- [ ] **Step 3: Delete the superseded mockup** (workspace hygiene): `git rm -r mockups/unified-inbox` and the now-shipped build plan `git rm command-center/app/docs/build-plans/unified-inbox.md` in the ship commit.

- [ ] **Step 4: Ship** push to main, watch the Cloudflare Pages deploy, smoke-test the live URL.

---

## Self-Review

- **Spec coverage:** Channel filter (Tasks 1,3,4,7,9), Source filter + classifier (1,3,4,7,9), origin strip (8), inline detail reusing thread/composer (8,9), source badge desktop + mobile (5,9,10), backend join (2,3), demo variety (11), connections doc (12), theming via tokens (global constraint, enforced in every component), no em dashes (global constraint). All covered.
- **Placeholders:** none; every code step carries full code. Task 12 step 1 references the sibling doc as the structural model rather than inlining 40 lines of prose, which is acceptable for a docs deliverable.
- **Type consistency:** `OriginKey`/`ChannelKey` identical in both trees; `ApiConversation` optional fields match server output; `convOrigin`/`convChannel` used consistently; component prop names match across tasks.
