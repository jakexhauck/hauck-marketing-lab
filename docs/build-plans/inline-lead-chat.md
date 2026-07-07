# Inline Lead Chat (pipeline cards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a chat button on every pipeline lead card that shows an unread badge when a genuinely new inbound message is waiting, and opens a centered popup to converse with the prospect across every channel they use (SMS, Email, Facebook, Instagram, Google, WhatsApp).

**Architecture:** The chat popup reuses the app's already-wired conversation stack (`ConversationThread` + `MessageComposer` inside a `ChannelFilterProvider`) inside a modal shell, keyed by lead id. Unread state is derived on the client by joining the existing `useConversationsQuery` feed (per-contact `unreadCount` + `lastMessageAt`, keyed by `contactId`) to each lead's `contactId`, with a locally-persisted "seen" timestamp per contact so the badge clears on open and re-lights only when a newer inbound arrives. No backend or GHL changes.

**Tech Stack:** React 18, TypeScript, TanStack Query, Tailwind (Modern Motion tokens), Vite, Vitest.

## Global Constraints

- Never use em dashes (—) anywhere: code, comments, UI copy. Use commas, periods, parentheses, or colons.
- Never name GoHighLevel / GHL in any client-facing UI copy.
- Client-facing copy only. This is the client app (`command-center/app`, package `client-dashboard`).
- Do NOT write read-state or anything else back to GHL. Unread clearing is client-side only ("pages before automations" standing rule).
- Reuse the existing conversation components (`ConversationThread`, `MessageComposer`, `ChannelFilterProvider`) unchanged. Do not fork or duplicate them.
- Typecheck command (run from `command-center/app`): `npm run typecheck`. Test command: `npm run test`. Build: `npm run build`.

## Scope / surfaces

The only pipeline surface that renders individual lead cards is `src/components/Board.tsx`, shared by the mobile Leads board and the desktop Pipeline (`LeadsDesktop`). One change covers both. The Reactivation and Reviews "pipelines" are read-only aggregate funnels (stage counts, no per-lead cards) so there is nothing to attach a button to there; they are explicitly out of scope. The "New Leads" list (`LeadsHub`) already opens the conversation on row click; out of scope for this plan.

## File Structure

**Create:**
- `src/lib/leadChat.ts` — pure unread-derivation logic: build a `contactId -> unread info` index from the conversations feed, and decide whether a given lead is "unread" against a locally-stored seen map. No React, no storage side effects (fully unit-tested).
- `src/lib/leadChat.test.ts` — Vitest unit tests for the above.
- `src/hooks/useLeadUnread.ts` — React hook: reads `useConversationsQuery`, builds the index once (memoized), owns the localStorage-persisted seen map, and exposes `unreadFor(contactId)` and `markSeen(contactId)`.
- `src/components/LeadChatModal.tsx` — the centered popup: modal shell (backdrop + Esc close) with a contact header and the reused conversation stack, keyed by lead id.

**Modify:**
- `src/components/Board.tsx` — add the chat button + unread badge to each card, and open `LeadChatModal` for the tapped lead; on open, call `markSeen(contactId)`.

---

### Task 1: Unread-derivation logic (`leadChat.ts`)

**Files:**
- Create: `command-center/app/src/lib/leadChat.ts`
- Test: `command-center/app/src/lib/leadChat.test.ts`

**Interfaces:**
- Consumes: `ApiConversation` from `../lib/api` (`{ contactId, unreadCount, lastMessageAt, channel? }`).
- Produces:
  - `interface UnreadInfo { unreadCount: number; lastMessageAt: string; channel: string }`
  - `type UnreadIndex = Map<string, UnreadInfo>` (key = contactId)
  - `type SeenMap = Record<string, string>` (contactId -> lastMessageAt already opened)
  - `buildUnreadIndex(conversations: ApiConversation[]): UnreadIndex`
  - `leadUnreadCount(index: UnreadIndex, contactId: string | null | undefined, seen: SeenMap): number` — returns `unreadCount` when the contact has a conversation with `unreadCount > 0` AND its `lastMessageAt` differs from the seen timestamp, else `0`.

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/leadChat.test.ts
import { describe, it, expect } from "vitest";
import { buildUnreadIndex, leadUnreadCount } from "./leadChat";
import type { ApiConversation } from "./api";

function conv(p: Partial<ApiConversation>): ApiConversation {
  return {
    id: "c",
    contactId: "k1",
    name: "Lead",
    preview: "",
    lastMessageType: "SMS",
    lastMessageAt: "2026-07-06T10:00:00Z",
    unreadCount: 0,
    ...p,
  };
}

describe("buildUnreadIndex", () => {
  it("keys conversations by contactId with unread info", () => {
    const idx = buildUnreadIndex([
      conv({ contactId: "a", unreadCount: 2, lastMessageAt: "T1", channel: "sms" }),
      conv({ contactId: "b", unreadCount: 0, lastMessageAt: "T2" }),
    ]);
    expect(idx.get("a")).toEqual({ unreadCount: 2, lastMessageAt: "T1", channel: "sms" });
    expect(idx.get("b")?.unreadCount).toBe(0);
  });

  it("defaults channel to 'other' when absent", () => {
    const idx = buildUnreadIndex([conv({ contactId: "a", unreadCount: 1 })]);
    expect(idx.get("a")?.channel).toBe("other");
  });
});

describe("leadUnreadCount", () => {
  const idx = buildUnreadIndex([
    conv({ contactId: "a", unreadCount: 3, lastMessageAt: "T1" }),
  ]);

  it("returns the unread count for an unseen inbound", () => {
    expect(leadUnreadCount(idx, "a", {})).toBe(3);
  });

  it("returns 0 once the latest message has been seen", () => {
    expect(leadUnreadCount(idx, "a", { a: "T1" })).toBe(0);
  });

  it("re-lights when a newer inbound arrives after being seen", () => {
    expect(leadUnreadCount(idx, "a", { a: "T0-older" })).toBe(3);
  });

  it("returns 0 for a missing contactId or no conversation", () => {
    expect(leadUnreadCount(idx, null, {})).toBe(0);
    expect(leadUnreadCount(idx, "zzz", {})).toBe(0);
  });

  it("returns 0 when the conversation has no unread", () => {
    const zero = buildUnreadIndex([conv({ contactId: "a", unreadCount: 0, lastMessageAt: "T1" })]);
    expect(leadUnreadCount(zero, "a", {})).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- leadChat`
Expected: FAIL ("Cannot find module './leadChat'" / exports not defined).

- [ ] **Step 3: Write minimal implementation**

```ts
// command-center/app/src/lib/leadChat.ts
import type { ApiConversation } from "./api";

export interface UnreadInfo {
  unreadCount: number;
  lastMessageAt: string;
  channel: string;
}

export type UnreadIndex = Map<string, UnreadInfo>;

// contactId -> the lastMessageAt the operator has already opened.
export type SeenMap = Record<string, string>;

// Index the conversations feed by contactId so a lead card can look up its
// unread state in O(1) by the contactId it already carries.
export function buildUnreadIndex(conversations: ApiConversation[]): UnreadIndex {
  const index: UnreadIndex = new Map();
  for (const c of conversations) {
    if (!c.contactId) continue;
    index.set(c.contactId, {
      unreadCount: c.unreadCount ?? 0,
      lastMessageAt: c.lastMessageAt,
      channel: c.channel ?? "other",
    });
  }
  return index;
}

// A lead is "unread" when its contact has genuinely new inbound waiting
// (unreadCount > 0, straight from the messaging feed) AND its newest message
// is not the one we already opened. Opening a chat records lastMessageAt as
// seen, so the badge clears at once and only re-lights on a newer inbound.
export function leadUnreadCount(
  index: UnreadIndex,
  contactId: string | null | undefined,
  seen: SeenMap,
): number {
  if (!contactId) return 0;
  const info = index.get(contactId);
  if (!info || info.unreadCount <= 0) return 0;
  if (seen[contactId] === info.lastMessageAt) return 0;
  return info.unreadCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- leadChat`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/leadChat.ts command-center/app/src/lib/leadChat.test.ts
git commit -m "feat(leads): unread-derivation logic for pipeline lead cards"
```

---

### Task 2: `useLeadUnread` hook

**Files:**
- Create: `command-center/app/src/hooks/useLeadUnread.ts`

**Interfaces:**
- Consumes: `useConversationsQuery` from `./useApi`, `useAuth` from `../context/AuthContext`, and `buildUnreadIndex` / `leadUnreadCount` / `SeenMap` from `../lib/leadChat`.
- Produces: `useLeadUnread(): { unreadFor: (contactId: string | null | undefined) => number; markSeen: (contactId: string | null | undefined) => void }`

**Notes:** No test (thin React/localStorage glue over the Task 1 pure functions, which are tested). Verified by typecheck + the Board wiring in Task 4.

- [ ] **Step 1: Write the hook**

```ts
// command-center/app/src/hooks/useLeadUnread.ts
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "./useApi";
import {
  buildUnreadIndex,
  leadUnreadCount,
  type SeenMap,
} from "../lib/leadChat";

const SEEN_KEY = "lead-chat-seen-v1";

function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

// Unread badge state for lead cards. Joins the conversations feed (per-contact
// unread + lastMessageAt) to a locally-persisted "seen" map so opening a chat
// clears the badge immediately and it only re-lights on a newer inbound. Purely
// client-side: no read-state is written back to the messaging backend.
export function useLeadUnread() {
  const { session } = useAuth();
  const { data } = useConversationsQuery(Boolean(session));
  const [seen, setSeen] = useState<SeenMap>(loadSeen);

  const index = useMemo(
    () => buildUnreadIndex(data?.conversations ?? []),
    [data?.conversations],
  );

  const unreadFor = useCallback(
    (contactId: string | null | undefined) =>
      leadUnreadCount(index, contactId, seen),
    [index, seen],
  );

  const markSeen = useCallback(
    (contactId: string | null | undefined) => {
      if (!contactId) return;
      const info = index.get(contactId);
      if (!info) return;
      setSeen((prev) => {
        if (prev[contactId] === info.lastMessageAt) return prev;
        const next = { ...prev, [contactId]: info.lastMessageAt };
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage failures; badge simply falls back to feed state.
        }
        return next;
      });
    },
    [index],
  );

  return { unreadFor, markSeen };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/hooks/useLeadUnread.ts
git commit -m "feat(leads): useLeadUnread hook joining conversations feed to cards"
```

---

### Task 3: `LeadChatModal` popup component

**Files:**
- Create: `command-center/app/src/components/LeadChatModal.tsx`

**Interfaces:**
- Consumes: `ConversationThread` (`{ leadId, fill }`), `MessageComposer` (`{ leadId, disabled }`), `ChannelFilterProvider` from `../context/ChannelFilterContext`, `Avatar`.
- Produces: `export default function LeadChatModal(props: { leadId: string; leadName: string; hasPhone?: boolean; onClose: () => void }): JSX.Element`

**Notes:** No unit test (presentational + reuses tested components). Verified by typecheck, build, and live browser in Task 4. The channel chips, per-lead available channels, default channel, email subject line, and real sending all come from the reused components unchanged.

- [ ] **Step 1: Write the component**

```tsx
// command-center/app/src/components/LeadChatModal.tsx
import { useEffect } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import ConversationThread from "./ConversationThread";
import MessageComposer from "./MessageComposer";
import { ChannelFilterProvider } from "../context/ChannelFilterContext";

// Centered popup to converse with a lead from any pipeline card. Reuses the
// wired conversation stack: the thread and composer share one ChannelFilter, so
// switching a channel chip in the composer filters the thread and retargets the
// send. Available channels and the default open channel come per-lead from the
// messaging feed, so a prospect who only ever texted shows a single channel.
export default function LeadChatModal({
  leadId,
  leadName,
  hasPhone = true,
  onClose,
}: {
  leadId: string;
  leadName: string;
  hasPhone?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.5)] p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversation with ${leadName}`}
    >
      <div
        className="flex h-[min(640px,88vh)] w-[min(470px,95vw)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Contact header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Avatar name={leadName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-semibold text-[var(--text)]">
              {leadName}
            </div>
            <div className="text-[11.5px] text-[var(--text-faint)]">Conversation</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            <X size={17} />
          </button>
        </div>

        {/* Reused conversation stack: thread + channel-aware composer */}
        <ChannelFilterProvider key={leadId}>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <ConversationThread leadId={leadId} fill />
            <div className="mt-auto">
              <MessageComposer leadId={leadId} disabled={!hasPhone} />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `Avatar`'s `size` prop does not accept `"sm"`, read `src/components/Avatar.tsx` and use a valid size value; do not invent props.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/components/LeadChatModal.tsx
git commit -m "feat(leads): LeadChatModal popup reusing the wired conversation stack"
```

---

### Task 4: Wire chat button + unread badge into `Board.tsx`

**Files:**
- Modify: `command-center/app/src/components/Board.tsx`

**Interfaces:**
- Consumes: `useLeadUnread` (Task 2), `LeadChatModal` (Task 3), existing `ApiLead` (`{ id, name, contactId, phone, ... }`).
- Produces: no new exports.

**Behavior:** Each card gains a chat button beside "Move". When the lead has unread, a pill badge with the count sits on the button and a brand accent bar marks the card. Tapping the button opens `LeadChatModal` for that lead and calls `markSeen(lead.contactId)` so the badge clears at once. Tapping the card body still navigates to the lead detail (unchanged).

- [ ] **Step 1: Add imports and hook + modal state**

At the top of `Board.tsx`, add to the imports:

```tsx
import { MessageSquare } from "lucide-react";
import LeadChatModal from "./LeadChatModal";
import { useLeadUnread } from "../hooks/useLeadUnread";
```

Inside `export default function Board(...)`, alongside the existing `useState` lines (near `const [moving, setMoving] = useState<ApiLead | null>(null);`), add:

```tsx
  const { unreadFor, markSeen } = useLeadUnread();
  const [chatFor, setChatFor] = useState<ApiLead | null>(null);

  const openChat = (lead: ApiLead) => {
    markSeen(lead.contactId);
    setChatFor(lead);
  };
```

- [ ] **Step 2: Add the chat button + badge to the card action row**

In the card render, replace the existing single "Move" button block:

```tsx
                      <button
                        type="button"
                        onClick={() => setMoving(lead)}
                        className="mt-2 w-full rounded-lg bg-[var(--surface-2)] py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.98]"
                      >
                        Move
                      </button>
```

with a flex row holding Move plus the chat button:

```tsx
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMoving(lead)}
                          className="flex-1 rounded-lg bg-[var(--surface-2)] py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.98]"
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          onClick={() => openChat(lead)}
                          aria-label={`Chat with ${lead.name}`}
                          className="relative grid w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--brand-primary)] transition-colors active:scale-[0.98]"
                        >
                          <MessageSquare size={15} aria-hidden />
                          {unreadFor(lead.contactId) > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--brand-primary)] px-1 text-[9.5px] font-bold text-white">
                              {unreadFor(lead.contactId)}
                            </span>
                          )}
                        </button>
                      </div>
```

- [ ] **Step 3: Add the unread accent bar to the card container**

Find the card wrapper `div` (the one with `className="fx-item fx-lift relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"`) and make its className conditional on unread so an unread card is marked:

```tsx
                    <div
                      key={lead.id}
                      className={
                        "fx-item fx-lift relative overflow-hidden rounded-xl border bg-[var(--surface)] p-3 " +
                        (unreadFor(lead.contactId) > 0
                          ? "border-[var(--brand-primary)]/50 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-[var(--brand-primary)] before:content-['']"
                          : "border-[var(--border)]")
                      }
                    >
```

- [ ] **Step 4: Render the modal at the end of the component**

Just before the closing `</div>` that wraps the returned board (next to the `<WonSheet ... />` element), add:

```tsx
      {chatFor && (
        <LeadChatModal
          leadId={chatFor.id}
          leadName={chatFor.name}
          hasPhone={chatFor.phone.replace(/[^0-9]/g, "").length >= 10}
          onClose={() => setChatFor(null)}
        />
      )}
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Fix any type error against the real prop shapes (do not add `any`).

- [ ] **Step 6: Commit**

```bash
git add command-center/app/src/components/Board.tsx
git commit -m "feat(leads): inline chat button + unread badge on pipeline cards"
```

---

### Task 5: Live verification (real app, Jake's browser)

**Files:** none (verification only).

- [ ] **Step 1: Run the app and drive it**

Start the client app (`npm run dev` in `command-center/app`, or the project run flow), sign in to a tenant with real leads (Willis), open the Pipeline.

- [ ] **Step 2: Verify against the acceptance checklist**

- Every lead card shows a chat button beside Move, on both the desktop Pipeline and the mobile board (narrow viewport).
- A lead with a genuinely new inbound message shows the count badge + accent bar.
- Tapping the chat button opens the centered popup with that lead's real thread.
- The channel chips reflect the channels that lead has actually used; switching filters the thread and relabels the send button; Email shows a subject field.
- The badge clears immediately on open and stays cleared after a page reload (until a newer inbound arrives).
- Tapping the card body (not the button) still navigates to the lead detail.
- Sending a message reaches the prospect (confirm one real send, or note it as Jake's smoke-test if sending to a real prospect is undesirable).

- [ ] **Step 3: Capture evidence**

Take Playwright/browser screenshots of: a card with an unread badge, the open popup with channel chips, and the mobile board. Attach to the ship report.

---

## Self-Review

- **Spec coverage:** chat button on cards (Task 4), unread badge = genuinely new inbound (Tasks 1, 2, 4), popup to chat (Task 3), channel switching incl. email/other (Task 3 via reused components), every pipeline with cards (Board = mobile + desktop; Reactivation/Reviews have no cards, documented in Scope). Covered.
- **Placeholder scan:** none; all steps carry real code.
- **Type consistency:** `buildUnreadIndex` / `leadUnreadCount` / `SeenMap` names match across Tasks 1-2; `useLeadUnread` returns `{ unreadFor, markSeen }` used verbatim in Task 4; `LeadChatModal` prop shape matches its call site.
- **Risk to confirm during build:** `Avatar` size prop value (Task 3 Step 2) and the exact card wrapper className string (Task 4 Step 3) must be matched against the real file at edit time.
