# Phase 05 - Right Rail UI (Discord-style comms surface)

**Read `00-INDEX.md` and `04-client-data-and-realtime-hooks.md` first.** Address Jake
as **"Sir"**. **No em dashes anywhere** (code, comments, UI strings).

## Goal
Build the user-facing comms UI on top of the Phase 04 typed client layer. On desktop
(lg+) it is a docked **right rail** that mirrors the left `Sidebar`: a channel list on
top, a member roster below, and a `Conversation` panel that overlays the rail when a
channel or DM is open. On phone it is a full-screen `/comms` route reachable from a new
"Team" bottom-nav tab. Both reuse the same primitives: `ChannelList`, `Roster`,
`Conversation`, `Composer`, `PresenceDot`, `RoleBadge`.

This phase is **read + send only**. It renders attachments if a message already carries
them, but the upload button is inert until Phase 08 wires it. The "Message Hauck" row
renders conditionally and is no-op-safe if the endpoint is not yet live (Phase 07).

This phase consumes, and must not redefine, the frozen contract:
- Types from `src/lib/api.ts`: `ChatRole`, `ChatMember`, `ChatChannel`,
  `ChatAttachment`, `ChatMessageDTO`.
- Pure helpers from `src/lib/chatLogic.ts`: `highestRole`, `isOnline`.
- Hooks from `src/hooks/useChat.ts`: `useChannels`, `useRoster`, `useChannelMessages`,
  `useSendMessage`, `useMarkRead`, `useOpenDm`, `useChatRoles`, `useEditMessage`,
  `useDeleteMessage`, and `useOpenHauck` (Phase 07; import-safe earlier).
- `ChatContext` from `src/context/ChatContext.tsx`: exposes the current `participant`
  and the live `presentIds: Set<string>` presence set via `useChat()`.

> If any imported name above does not yet exist when you run this phase, stop and
> finish Phase 04 first. Do not stub or rename the contract.

## Files
- Create: `command-center/app/src/components/comms/PresenceDot.tsx`
- Create: `command-center/app/src/components/comms/RoleBadge.tsx`
- Create: `command-center/app/src/components/comms/ChannelList.tsx`
- Create: `command-center/app/src/components/comms/Roster.tsx`
- Create: `command-center/app/src/components/comms/Composer.tsx`
- Create: `command-center/app/src/components/comms/Conversation.tsx`
- Create: `command-center/app/src/components/comms/RightRail.tsx`
- Create: `command-center/app/src/routes/Comms.tsx`
- Modify: `command-center/app/src/components/Shell.tsx` (mount `<RightRail />`)
- Modify: `command-center/app/src/App.tsx` (register `/comms` route)
- Modify: `command-center/app/src/lib/nav.ts` (add the "Team" nav item)
- Modify: `command-center/app/src/components/BottomNav.tsx` (add `comms` key + route)

## Conventions this phase locks in
- Styling: Tailwind v4 + CSS custom properties only. Surfaces `bg-[var(--surface)]`,
  text `text-[var(--text)]`, muted `text-[var(--text-muted)]`, faint
  `text-[var(--text-faint)]`, borders `border-[var(--border)]`, dividers
  `border-[var(--divider)]`. Brand green `var(--brand-primary)` (`#4dbb83`). Display
  type uses the `font-display` class (Poppins); body is the Inter default.
- `cn()` is imported from `"../../lib/cn"` (confirmed in `Avatar`/`Badge` siblings).
  In `Shell.tsx` it is `"../lib/cn"`.
- Reuse `Avatar` (`import Avatar from "../Avatar"`, `<Avatar name={m.name} size="sm" />`)
  and `Badge` (`import { Badge } from "../ui/Badge"`).
- Auth/role gating via `import { useAuth } from "../../context/AuthContext"`. The owner
  flag is `isOwner` (full moderation: delete any message). A message author is detected
  by comparing the message sender to the current `participant` from `useChat()`.
- Presence id format is `${kind}:${id}` (e.g. `staff:abc`), matched against
  `presentIds` via `isOnline(...)` from `chatLogic`.

---

## Work

### 1. `PresenceDot.tsx`

A small status dot. Green when online, grey when offline. Online state is computed by
the caller (the dot stays presentational so it works in both the rail and the roster).

```tsx
import { cn } from "../../lib/cn";

// A small presence indicator. Online is decided by the caller (via isOnline against
// the ChatContext presentIds set), so this stays purely presentational.
export default function PresenceDot({
  online,
  className,
}: {
  online: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full ring-2", className)}
      style={{
        background: online ? "var(--brand-primary)" : "var(--text-faint)",
        // Ring blends the dot into whatever surface it sits on (avatar corner, row).
        "--tw-ring-color": "var(--surface)",
      } as React.CSSProperties}
      title={online ? "Online" : "Offline"}
      aria-label={online ? "Online" : "Offline"}
    />
  );
}
```

### 2. `RoleBadge.tsx`

A pill rendering a `ChatRole` name in its own color. Reuses the `Badge` shell for shape
and spacing, then overrides the color inline from `role.color` (roles carry arbitrary
hex, so the tone-class palette does not cover them).

```tsx
import { Badge } from "../ui/Badge";
import type { ChatRole } from "../../lib/api";

// A cosmetic role pill colored by role.color. Reuses the Badge shell for shape and
// type; the color is per-role hex so we tint inline instead of using a tone class.
export default function RoleBadge({
  role,
  className,
}: {
  role: ChatRole;
  className?: string;
}) {
  return (
    <Badge
      tone="neutral"
      className={className}
      // 18% alpha background of the role color, full-strength text + border.
      // Inline because role.color is arbitrary per-tenant hex.
      // eslint-disable-next-line react/forbid-dom-props
    >
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{
          color: role.color,
          background: `color-mix(in srgb, ${role.color} 16%, transparent)`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: role.color }}
          aria-hidden
        />
        {role.name}
      </span>
    </Badge>
  );
}
```

> Note: the outer `Badge` provides the canonical pill metrics; the inner span carries
> the per-role color. If a future cleanup wants a single element, extend `Badge` to take
> a `style` prop. For this phase, do not modify `Badge`.

### 3. `ChannelList.tsx`

Three sections: **Channels**, **Direct Messages**, and a single **Message Hauck** row.
Channels and DMs come from `useChannels()` (`ChatChannel.kind` splits them). Unread
badges read `ChatChannel.unread`. The Hauck row only renders when the current user may
contact Hauck; it calls `useOpenHauck()` (Phase 07) and is **no-op-safe**: if the
endpoint 403s or is not yet deployed, the hook surfaces an error and the row simply does
nothing visible beyond a disabled state. We gate the row on the caller's
`canContactHauck` capability rather than on a network probe, so the UI never flickers.

The active channel id and the open handler are passed in by the parent (`RightRail` or
`Comms`), so the same list drives desktop overlay and mobile full-screen.

```tsx
import { Hash, AtSign, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";
import { useChannels, useOpenHauck } from "../../hooks/useChat";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import type { ChatChannel } from "../../lib/api";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none text-[var(--brand-fg)]"
      style={{ background: "var(--brand-primary)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChannelRow({
  channel,
  active,
  onOpen,
  icon: Icon,
}: {
  channel: ChatChannel;
  active: boolean;
  onOpen: (id: string) => void;
  icon: typeof Hash;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(channel.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-medium transition-colors",
        active
          ? "text-[var(--brand-text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
      style={active ? { background: "var(--brand-primary-tint)" } : undefined}
    >
      <Icon size={15} className="shrink-0 opacity-70" />
      <span className="truncate">{channel.name || "Untitled"}</span>
      <UnreadBadge count={channel.unread} />
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
      {children}
    </div>
  );
}

export default function ChannelList({
  activeChannelId,
  onOpenChannel,
}: {
  activeChannelId: string | null;
  onOpenChannel: (id: string) => void;
}) {
  const { isOwner } = useAuth();
  const { participant } = useChat();
  const channelsQuery = useChannels();
  const openHauck = useOpenHauck();

  const channels = channelsQuery.data?.channels ?? [];
  const roomChannels = channels.filter((c) => c.kind === "channel");
  const dmChannels = channels.filter((c) => c.kind === "dm");

  // The Hauck line is offered to the owner and to any staff the owner has granted
  // can_contact_hauck. We gate on the participant capability, not on a live probe,
  // so the row never flickers. Clicking opens (or creates) the channel via Phase 07.
  const canContactHauck = isOwner || participant?.canContactHauck === true;

  return (
    <div className="flex flex-col">
      <SectionLabel>Channels</SectionLabel>
      {roomChannels.length === 0 ? (
        <div className="px-2.5 py-1 text-[12.5px] text-[var(--text-faint)]">No channels yet.</div>
      ) : (
        roomChannels.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            onOpen={onOpenChannel}
            icon={Hash}
          />
        ))
      )}

      <SectionLabel>Direct Messages</SectionLabel>
      {dmChannels.length === 0 ? (
        <div className="px-2.5 py-1 text-[12.5px] text-[var(--text-faint)]">
          Pick someone in the roster to start a chat.
        </div>
      ) : (
        dmChannels.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            onOpen={onOpenChannel}
            icon={AtSign}
          />
        ))
      )}

      {canContactHauck && (
        <>
          <SectionLabel>Direct line</SectionLabel>
          <button
            type="button"
            disabled={openHauck.isPending}
            onClick={() => {
              // No-op-safe: if /api/chat/hauck is not live yet (Phase 07) the mutation
              // rejects and onError surfaces it; the UI just stays put.
              openHauck.mutate(undefined, {
                onSuccess: (data) => onOpenChannel(data.channel.id),
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <ShieldCheck size={15} className="shrink-0" style={{ color: "var(--brand-primary)" }} />
            <span className="truncate">Message Hauck</span>
          </button>
        </>
      )}
    </div>
  );
}
```

> The Hauck row reads `participant.canContactHauck`. `ChatContext` exposes the current
> participant; confirm Phase 04 includes `canContactHauck` on it (the `ChatMember`
> type already carries the field). If the participant shape omits it, fall back to
> `isOwner` only and note the gap for Phase 07. Do not invent fields.

### 4. `Roster.tsx`

Members from `useRoster()`, grouped by their `highestRole` (from `chatLogic`). Section
headers use the role name; each member name is tinted by that role's color. Each row
carries a `PresenceDot` driven by `isOnline(`${kind}:${id}`, presentIds)` and clicking a
member opens (or creates) a DM via `useOpenDm()`. The current user is shown but not
clickable.

```tsx
import { useMemo } from "react";
import { cn } from "../../lib/cn";
import Avatar from "../Avatar";
import PresenceDot from "./PresenceDot";
import { useRoster, useOpenDm } from "../../hooks/useChat";
import { useChat } from "../../context/ChatContext";
import { highestRole, isOnline } from "../../lib/chatLogic";
import type { ChatMember } from "../../lib/api";

const NO_ROLE = "__none__";

export default function Roster({
  onOpenChannel,
}: {
  onOpenChannel: (id: string) => void;
}) {
  const { participant, presentIds } = useChat();
  const rosterQuery = useRoster();
  const openDm = useOpenDm();
  const members = rosterQuery.data?.members ?? [];

  // Group by highest role, preserving role rank (highest sortOrder first) so the
  // strongest roles render at the top, mirroring Discord's grouped sidebar.
  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; color: string; rank: number; members: ChatMember[] }>();
    for (const m of members) {
      const top = highestRole(m.roles);
      const key = top?.id ?? NO_ROLE;
      if (!byKey.has(key)) {
        byKey.set(key, {
          label: top?.name ?? "Members",
          color: top?.color ?? "var(--text-muted)",
          rank: top?.sortOrder ?? -1,
          members: [],
        });
      }
      byKey.get(key)!.members.push(m);
    }
    return [...byKey.values()].sort((a, b) => b.rank - a.rank);
  }, [members]);

  if (rosterQuery.isLoading) {
    return <div className="px-2.5 py-2 text-[12.5px] text-[var(--text-faint)]">Loading roster.</div>;
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <div key={g.label} className="mb-1">
          <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            {g.label} ({g.members.length})
          </div>
          {g.members.map((m) => {
            const online = isOnline(`staff:${m.id}`, presentIds);
            const isSelf = participant?.kind === "staff" && participant.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={isSelf}
                onClick={() => {
                  // Get-or-create a DM with this member, then open it.
                  openDm.mutate(
                    { memberId: m.id },
                    { onSuccess: (data) => onOpenChannel(data.channel.id) },
                  );
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  isSelf
                    ? "cursor-default opacity-90"
                    : "hover:bg-[var(--surface-2)]",
                )}
              >
                <span className="relative shrink-0">
                  <Avatar name={m.name} size="sm" />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceDot online={online} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13.5px] font-medium"
                    style={{ color: g.color }}
                  >
                    {m.name}
                    {isSelf && <span className="ml-1 text-[var(--text-faint)]">(you)</span>}
                  </span>
                  {!online && m.lastSeen && (
                    <span className="block truncate text-[11px] text-[var(--text-faint)]">
                      last seen {new Date(m.lastSeen).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

### 5. `Composer.tsx`

A textarea plus a send button driven by `useSendMessage()`. Enter sends, Shift+Enter
inserts a newline. The attachment button is rendered but **disabled with no handler**:
it is labeled "Attach" and becomes functional in Phase 08. The button stays visible so
the layout does not shift when the feature lands.

```tsx
import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Send, Paperclip } from "lucide-react";
import { useSendMessage } from "../../hooks/useChat";

export default function Composer({ channelId }: { channelId: string }) {
  const [body, setBody] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage(channelId);

  const send = () => {
    const text = body.trim();
    if (!text || sendMessage.isPending) return;
    sendMessage.mutate({ body: text });
    setBody("");
    taRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-[var(--divider)] bg-[var(--surface)] p-2.5">
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--brand-primary)]">
        {/* Attachment upload is wired in Phase 08. The control is rendered now so the
            composer layout is stable; it is disabled and intentionally has no handler. */}
        <button
          type="button"
          disabled
          aria-label="Attach a file (coming soon)"
          title="Attachments arrive in a later update"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] disabled:cursor-not-allowed"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message"
          className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || sendMessage.isPending}
          aria-label="Send message"
          className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40"
          style={{ color: "var(--brand-primary)" }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
```

### 6. `Conversation.tsx`

A header (channel/DM name), a scrollable message list, and the `Composer` at the bottom.
Messages come from `useChannelMessages(channelId)`. On mount and on new messages it calls
`useMarkRead(channelId)` so unread counts clear. Each `ChatMessageDTO` renders the sender
name, time, and body. Own messages get **edit** and **delete** affordances; the owner
sees **delete** on any message (moderation). A soft-deleted message (`deletedAt` set)
renders a muted "message deleted" line. Attachments render inline for images and as a
download chip otherwise (the chip is non-functional until Phase 08 wires the signed-URL
endpoint, so it renders the file name without an `href`).

```tsx
import { useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, FileText } from "lucide-react";
import { cn } from "../../lib/cn";
import Avatar from "../Avatar";
import Composer from "./Composer";
import {
  useChannelMessages,
  useMarkRead,
  useEditMessage,
  useDeleteMessage,
} from "../../hooks/useChat";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import type { ChatAttachment, ChatMessageDTO } from "../../lib/api";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function AttachmentView({ a }: { a: ChatAttachment }) {
  const isImage = a.mimeType.startsWith("image/");
  if (isImage) {
    // Phase 08 swaps this for the signed download URL. Until then we render the
    // metadata frame so the layout is correct; no network fetch happens here.
    return (
      <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-muted)]">
          <FileText size={14} /> {a.fileName}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)]">
      <FileText size={14} /> {a.fileName}
    </div>
  );
}

function MessageRow({
  msg,
  canEdit,
  canDelete,
}: {
  msg: ChatMessageDTO;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.body);
  const editMessage = useEditMessage(msg.channelId);
  const deleteMessage = useDeleteMessage(msg.channelId);

  if (msg.deletedAt) {
    return (
      <div className="px-3 py-1.5 text-[13px] italic text-[var(--text-faint)]">
        message deleted
      </div>
    );
  }

  return (
    <div className="group flex gap-2.5 px-3 py-1.5 hover:bg-[var(--surface-2)]">
      <Avatar name={msg.senderName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold text-[var(--text)]">{msg.senderName}</span>
          <span className="text-[11px] text-[var(--text-faint)]">{timeLabel(msg.createdAt)}</span>
          {msg.editedAt && <span className="text-[11px] text-[var(--text-faint)]">(edited)</span>}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[14px] text-[var(--text)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
            <div className="flex gap-2 text-[12.5px]">
              <button
                type="button"
                onClick={() => {
                  const text = draft.trim();
                  if (text && text !== msg.body) editMessage.mutate({ messageId: msg.id, body: text });
                  setEditing(false);
                }}
                className="font-semibold"
                style={{ color: "var(--brand-primary)" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(msg.body);
                  setEditing(false);
                }}
                className="text-[var(--text-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap break-words text-[14px] text-[var(--text)]">{msg.body}</div>
            {msg.attachments.map((a) => (
              <AttachmentView key={a.id} a={a} />
            ))}
          </>
        )}
      </div>

      {(canEdit || canDelete) && !editing && (
        <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit message"
              className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text)]"
            >
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => deleteMessage.mutate({ messageId: msg.id })}
              aria-label="Delete message"
              className="rounded p-1 text-[var(--text-faint)] hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Conversation({
  channelId,
  title,
  onClose,
}: {
  channelId: string;
  title: string;
  onClose?: () => void;
}) {
  const { isOwner } = useAuth();
  const { participant } = useChat();
  const messagesQuery = useChannelMessages(channelId);
  const markRead = useMarkRead(channelId);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data?.messages ?? [];

  // Clear unread when the channel is open and whenever new messages land.
  useEffect(() => {
    if (messages.length > 0) markRead.mutate();
    // markRead identity is stable per channelId via the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, messages.length]);

  // Keep the latest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <header className="flex items-center gap-2 border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2.5">
        <h2 className="truncate font-display text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="ml-auto rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {messagesQuery.isLoading ? (
          <div className="px-3 py-6 text-[13px] text-[var(--text-faint)]">Loading messages.</div>
        ) : messages.length === 0 ? (
          <div className="px-3 py-6 text-[13px] text-[var(--text-faint)]">
            No messages yet. Say hello.
          </div>
        ) : (
          messages.map((m) => {
            const isAuthor =
              participant?.kind === m.senderKind && participant.id === m.senderId;
            return (
              <MessageRow
                key={m.id}
                msg={m}
                canEdit={isAuthor}
                canDelete={isAuthor || isOwner}
              />
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <Composer channelId={channelId} />
    </div>
  );
}
```

> `useChannelMessages` returns messages oldest-first for rendering. If Phase 04 returns
> them newest-first (the endpoint orders `created_at desc`), reverse in the hook's
> `select`, not here. Keep the UI dumb.

### 7. `RightRail.tsx`

The desktop docked rail. Mirrors the left `Sidebar` exactly: `hidden ... lg:flex`,
fixed width `w-[300px]`, `border-l` (the left rail uses `border-r`), `lg:sticky lg:top-0`,
full `h-dvh`. It stacks `ChannelList` (top) and `Roster` (below) in a single scroll
column. Selecting a channel or member opens a `Conversation` in an absolutely positioned
overlay panel covering the rail; closing it returns to the list.

```tsx
import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import ChannelList from "./ChannelList";
import Roster from "./Roster";
import Conversation from "./Conversation";
import { useChannels } from "../../hooks/useChat";

export default function RightRail() {
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const channelsQuery = useChannels();

  const openChannel = channelsQuery.data?.channels.find((c) => c.id === openChannelId) ?? null;

  return (
    <aside className="relative hidden h-dvh w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:flex">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <MessagesSquare size={18} style={{ color: "var(--brand-primary)" }} />
        <span className="font-display text-[15px] font-semibold text-[var(--text)]">Team</span>
      </div>

      {/* List column: channels then roster, single scroll. */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <ChannelList activeChannelId={openChannelId} onOpenChannel={setOpenChannelId} />
        <div className="my-3 border-t border-[var(--divider)]" />
        <Roster onOpenChannel={setOpenChannelId} />
      </div>

      {/* Conversation overlay: covers the rail when a channel/DM is open. */}
      {openChannelId && (
        <div className="absolute inset-0 z-10 bg-[var(--bg)]">
          <Conversation
            channelId={openChannelId}
            title={openChannel?.name || "Conversation"}
            onClose={() => setOpenChannelId(null)}
          />
        </div>
      )}
    </aside>
  );
}
```

### 8. `Comms.tsx` (mobile full-screen route)

The phone surface. Reuses the same primitives in a full-screen column: a navy hero
header, the `ChannelList` + `Roster` as the list view, and the `Conversation` pushed
over the list when a channel is open. Renders `<BottomNav active="comms" />`.

```tsx
import { useState } from "react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import BottomNav from "../components/BottomNav";
import ChannelList from "../components/comms/ChannelList";
import Roster from "../components/comms/Roster";
import Conversation from "../components/comms/Conversation";
import { useChannels } from "../hooks/useChat";

export default function Comms() {
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const channelsQuery = useChannels();
  const openChannel = channelsQuery.data?.channels.find((c) => c.id === openChannelId) ?? null;

  return (
    <Shell>
      {/* Phone: full-screen team surface. The desktop rail (RightRail) covers lg+,
          so this column is the mobile-only experience under lg. */}
      <div className="flex min-h-dvh flex-col lg:hidden">
        {openChannelId ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation
              channelId={openChannelId}
              title={openChannel?.name || "Conversation"}
              onClose={() => setOpenChannelId(null)}
            />
          </div>
        ) : (
          <>
            <NavyHero>
              <h1 className="font-display text-2xl font-semibold">Team</h1>
              <p className="mt-1 text-sm text-white/70">Channels, DMs, and your roster.</p>
            </NavyHero>
            <main className="flex-1 overflow-y-auto px-3 pb-24 pt-3">
              <ChannelList activeChannelId={openChannelId} onOpenChannel={setOpenChannelId} />
              <div className="my-4 border-t border-[var(--divider)]" />
              <Roster onOpenChannel={setOpenChannelId} />
            </main>
          </>
        )}
      </div>

      {/* lg+: the docked RightRail already shows comms beside content, so the route
          body is empty there and the user is gently pointed to the rail. */}
      <div className="hidden min-h-dvh flex-1 items-center justify-center lg:flex">
        <p className="text-[14px] text-[var(--text-muted)]">Team chat lives in the right rail.</p>
      </div>

      <BottomNav active="comms" />
    </Shell>
  );
}
```

### 9. Wire `<RightRail />` into `Shell.tsx`

Mount it as the **last child of the flex row**, gated on `authed` exactly like
`<Sidebar />`.

Before:
```tsx
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
// ...
  return (
    <div className={cn("min-h-dvh bg-[var(--bg)]", authed && "lg:flex")}>
      {authed && <Sidebar />}
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-md flex-col",
          authed && "lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </div>
    </div>
  );
```

After:
```tsx
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import RightRail from "./comms/RightRail";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";
// ...
  return (
    <div className={cn("min-h-dvh bg-[var(--bg)]", authed && "lg:flex")}>
      {authed && <Sidebar />}
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-md flex-col",
          authed && "lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </div>
      {authed && <RightRail />}
    </div>
  );
```

> `RightRail` is `hidden lg:flex`, so on phone it renders nothing and never competes
> with the centered `max-w-md` column. On lg+ it docks on the right of every
> authenticated screen, just as `Sidebar` docks on the left.

### 10. Register the `/comms` route in `App.tsx`

Add the import alongside the other route imports:
```tsx
import Comms from "./routes/Comms";
```

Add the route inside `<Routes>` near the other `ProtectedRoute` entries (for example,
right after the `/conversations/:contactId` route):
```tsx
              <Route
                path="/comms"
                element={
                  <ProtectedRoute>
                    <Comms />
                  </ProtectedRoute>
                }
              />
```

### 11. Add the "Team" nav item in `nav.ts`

Add `MessagesSquare` to the lucide import, then append the nav item.

Before (import head):
```ts
import {
  Home,
  GitBranch,
  Megaphone,
  MessageSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  UserCog,
  type LucideIcon,
} from "lucide-react";
```

After:
```ts
import {
  Home,
  GitBranch,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  UserCog,
  type LucideIcon,
} from "lucide-react";
```

Append to the `NAV` array (placed so it reads naturally in the bottom bar; it has no
`capability`, so every signed-in user sees it):
```ts
  { to: "/comms", label: "Chat", shortLabel: "Chat", icon: MessagesSquare, bottomNav: true },
```

> Note: the label is "Chat" (per the frozen INDEX contract), NOT "Team", because there is
> already an owner-only `{ to: "/team", label: "Team", icon: UserCog }` staff-management
> surface. Using "Chat" with the `MessagesSquare` icon keeps the two visually distinct. If
> the owner later prefers a different word for the comms item, rename the label in a
> follow-up; the contract label here is "Team" per the INDEX, so keep it for now.

### 12. Extend `BottomNav.tsx`

Add `comms` to the `NavKey` type and `ROUTE_BY_KEY`.

Before:
```ts
export type NavKey = "home" | "leads" | "conversations" | "contacts";

const ROUTE_BY_KEY: Record<NavKey, string> = {
  home: "/home",
  leads: "/leads",
  conversations: "/conversations",
  contacts: "/contacts",
};
```

After:
```ts
export type NavKey = "home" | "leads" | "conversations" | "contacts" | "comms";

const ROUTE_BY_KEY: Record<NavKey, string> = {
  home: "/home",
  leads: "/leads",
  conversations: "/conversations",
  contacts: "/contacts",
  comms: "/comms",
};
```

> The bottom bar holds up to five day-to-day tabs filtered by `bottomNav: true`. Adding
> "Team" makes five (Home, Leads, Chats, Contacts, Team). Confirm the bar still reads
> cleanly at the narrowest supported width during visual verification; if it crowds,
> drop `bottomNav` from a lower-priority item in a follow-up rather than truncating
> labels here.

### 13. Commit

```bash
git add command-center/app/src/components/comms \
  command-center/app/src/routes/Comms.tsx \
  command-center/app/src/components/Shell.tsx \
  command-center/app/src/App.tsx \
  command-center/app/src/lib/nav.ts \
  command-center/app/src/components/BottomNav.tsx
git commit -m "feat(comms): right-rail UI, conversation view, composer, mobile /comms route"
```

---

## Visual verification (M9)

Run the app and prove the surfaces render in both themes. No "should work" claims;
attach the screenshots.

```bash
cd command-center/app && npm run dev
```

1. Sign in as an owner. On a desktop viewport (1440 wide), confirm the **right rail**
   docks on the right with Channels, Direct Messages, the "Message Hauck" row, and the
   grouped Roster with presence dots. Open a channel: the `Conversation` overlay covers
   the rail, messages render, the composer sends on Enter.
2. Playwright screenshots (real running app), saved to a scratch dir, deleted after:
   - Desktop right rail, list view, **light** mode.
   - Desktop right rail, conversation open, **light** mode.
   - Desktop right rail, **dark** mode (toggle via the sidebar).
   - Mobile `/comms` list view (390 wide), **light** and **dark**.
   - Mobile `/comms` with a conversation open.
3. Verify the **Message Hauck** row is no-op-safe: with Phase 07 not yet deployed,
   clicking it must not crash the app (the mutation rejects quietly). Confirm in the
   console that no unhandled rejection escapes.
4. Confirm the attachment button in the composer is visible but disabled, and that a
   message carrying `attachments` (seed one manually if needed) renders the download
   chip / image frame.
5. Type-check and lint clean:
   ```bash
   cd command-center/app && npm run build
   ```

Take the screenshots with the Playwright MCP browser tools against the local dev URL.
Delete the scratch screenshots once reviewed (workspace hygiene).

## Definition of done
- `src/components/comms/` holds the seven components; all typed against the frozen
  `src/lib/api.ts` contract with no redefined types.
- `<RightRail />` docks on the right of every authenticated lg+ screen, mirroring the
  left `Sidebar` (border-l, w-[300px], sticky, full dvh, hidden under lg).
- `/comms` is a `ProtectedRoute`, reachable from the "Team" bottom-nav tab, and renders
  `<BottomNav active="comms" />`.
- Channels, DMs, roster grouping by `highestRole`, presence dots, unread badges, send,
  edit, delete (author + owner moderation), and soft-deleted rendering all work against
  the Phase 04 hooks.
- Attachments render if present; the upload button is visible but inert (activates in
  Phase 08). The "Message Hauck" row renders conditionally and is no-op-safe.
- `npm run build` passes; visual verification screenshots captured in light and dark for
  desktop and mobile.

## MANUAL ACTIONS - JAKE
None.
