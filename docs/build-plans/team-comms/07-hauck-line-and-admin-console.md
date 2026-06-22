# Phase 07 - Hauck Line and Admin Console

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Wire the permission-gated direct line to Hauck (Jake) and the admin side that
answers it. A client (the tenant owner, or any staff member whose
`staff_accounts.can_contact_hauck` is true) can open a private `kind='hauck'`
channel whose members are that one person plus every active admin. On the admin
side, Jake gets a Messages inbox that lists every Hauck thread across all tenants,
opens any conversation, marks it read, and replies. Replies are delivered back to
the client through the same notify-then-fetch Realtime transport as the rest of
chat. This phase ships four endpoints, one admin page, the route + nav wiring, and
the client/admin hooks.

This phase depends on the frozen contract in `00-INDEX.md` (the `ChatChannel`,
`ChatMessageDTO`, `AdminHauckThread` shapes, the table names, and the
`staff_accounts.can_contact_hauck` column from Phase 01), the participant resolver
and `notifyParticipants` from Phase 02, and the client hook style from Phase 04.

## Files
- Create: `command-center/app/functions/api/chat/hauck.ts`
- Create: `command-center/app/functions/api/admin/messages/index.ts`
- Create: `command-center/app/functions/api/admin/messages/[channelId]/messages.ts`
- Create: `command-center/app/functions/api/admin/messages/[channelId]/send.ts`
- Create: `command-center/app/src/routes/admin/AdminMessages.tsx`
- Modify: `command-center/app/src/hooks/useChat.ts` (add `useOpenHauck`, `useAdminThreads`, `useAdminThreadMessages`, `useAdminSendMessage`)
- Modify: `command-center/app/src/App.tsx` (register `/admin/messages` under `<AdminRoute>`)
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx` (add the Messages nav item)

## Work

### 1. `functions/api/chat/hauck.ts` - get-or-create the caller's Hauck channel

`GET /api/chat/hauck`. Allowed only if the caller is the tenant owner
(`ctx.data.isOwner`) or a staff member whose `can_contact_hauck` is true; otherwise
`403 { error: "hauck_not_allowed" }`. Resolve the caller into a participant (Phase
02), find the existing `kind='hauck'` channel the caller is a member of for this
tenant, and return it; if none exists, create it with members = the caller plus
every active admin (`member_kind='admin'`), named `Hauck`. Idempotent: a second
call returns the same channel.

```ts
import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

// Shape returned to the client. Mirrors ChatChannel in src/lib/api.ts.
interface ChatChannelDTO {
  id: string;
  kind: "channel" | "dm" | "hauck";
  name: string;
  memberIds: string[];
  unread: number;
  lastMessageAt: string | null;
}

// GET /api/chat/hauck
// Get-or-create the caller's private Hauck channel. Owner or a staff member with
// can_contact_hauck only. Members are the caller plus every active admin.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant || participant.kind !== "staff") {
    // An admin or an identity-less shared-owner session cannot own a Hauck line.
    return Response.json({ error: "hauck_not_allowed" }, { status: 403 });
  }

  // Permission gate: tenant owner, or a staff member flagged can_contact_hauck.
  let allowed = Boolean(ctx.data.isOwner);
  if (!allowed) {
    const { data: staffRow } = await client
      .from("staff_accounts")
      .select("can_contact_hauck")
      .eq("id", participant.id)
      .maybeSingle();
    allowed = Boolean((staffRow as { can_contact_hauck?: boolean } | null)?.can_contact_hauck);
  }
  if (!allowed) return Response.json({ error: "hauck_not_allowed" }, { status: 403 });

  // Existing Hauck channel this caller already belongs to (idempotent path).
  const { data: existingMember } = await client
    .from("chat_channel_members")
    .select("channel_id, chat_channels!inner(id, kind, tenant_id)")
    .eq("member_kind", "staff")
    .eq("member_id", participant.id)
    .eq("chat_channels.kind", "hauck")
    .eq("chat_channels.tenant_id", tenantId)
    .maybeSingle();

  let channelId =
    (existingMember as { channel_id?: string } | null)?.channel_id ?? null;

  if (!channelId) {
    // Create the channel and its membership set: the caller + every active admin.
    const { data: created, error: createErr } = await client
      .from("chat_channels")
      .insert({
        tenant_id: tenantId,
        kind: "hauck",
        name: "Hauck",
        created_by_kind: "staff",
        created_by_id: participant.id,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return Response.json({ error: createErr?.message ?? "could not create channel" }, { status: 500 });
    }
    channelId = (created as { id: string }).id;

    const { data: admins } = await client
      .from("admin_accounts")
      .select("id")
      .eq("status", "active");

    const members = [
      { channel_id: channelId, tenant_id: tenantId, member_kind: "staff", member_id: participant.id },
      ...((admins ?? []) as { id: string }[]).map((a) => ({
        channel_id: channelId as string,
        tenant_id: tenantId,
        member_kind: "admin",
        member_id: a.id,
      })),
    ];
    const { error: memberErr } = await client.from("chat_channel_members").insert(members);
    if (memberErr) {
      // Roll back the orphan channel so a retry recreates cleanly.
      await client.from("chat_channels").delete().eq("id", channelId);
      return Response.json({ error: memberErr.message }, { status: 500 });
    }
  }

  // Resolve the member id list + last message timestamp for the DTO.
  const { data: memberRows } = await client
    .from("chat_channel_members")
    .select("member_id")
    .eq("channel_id", channelId);
  const memberIds = ((memberRows ?? []) as { member_id: string }[]).map((m) => m.member_id);

  const { data: lastMsg } = await client
    .from("chat_messages")
    .select("created_at")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const channel: ChatChannelDTO = {
    id: channelId,
    kind: "hauck",
    name: "Hauck",
    memberIds,
    unread: 0,
    lastMessageAt: (lastMsg as { created_at?: string } | null)?.created_at ?? null,
  };
  return Response.json({ channel });
};
```

Note: confirm the actual column names on `chat_channels`
(`created_by_kind` / `created_by_id`) and `chat_channel_members`
(`tenant_id` denormalized) against migration `0016` from Phase 01 before relying on
them; the INDEX freezes the table set but not every column. If a column differs, use
the real name. Do not invent fields.

### 2. `functions/api/admin/messages/index.ts` - the admin inbox list

`GET /api/admin/messages`. Admin only: `ctx.data.admin` is already set by the
middleware on every `/api/admin/*` route, so this handler does not re-check
identity. Return every `kind='hauck'` channel across all tenants, joined to the
tenant name and the non-admin (staff) member's name, with this admin's unread count
(messages created after that admin's `last_read_at` for the channel) and the last
message timestamp. Order by `lastMessageAt` desc.

```ts
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// Mirrors AdminHauckThread in src/lib/api.ts.
interface AdminHauckThreadDTO {
  channelId: string;
  tenantId: string;
  tenantName: string;
  personName: string;
  unread: number;
  lastMessageAt: string | null;
}

// GET /api/admin/messages  (admin-only, gated in _middleware.ts)
// Every Hauck thread across all tenants, newest activity first.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  // All Hauck channels, with tenant name joined.
  const { data: channels, error } = await client
    .from("chat_channels")
    .select("id, tenant_id, tenants(name)")
    .eq("kind", "hauck");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (channels ?? []) as unknown as {
    id: string;
    tenant_id: string;
    tenants: { name: string } | null;
  }[];

  const threads: AdminHauckThreadDTO[] = [];
  for (const ch of rows) {
    // The non-admin member (the client) gives the thread its person name.
    const { data: staffMember } = await client
      .from("chat_channel_members")
      .select("member_id, staff_accounts(name)")
      .eq("channel_id", ch.id)
      .eq("member_kind", "staff")
      .maybeSingle();
    const personName =
      (staffMember as { staff_accounts?: { name?: string } | null } | null)?.staff_accounts?.name ??
      "Unknown";

    // This admin's last_read_at for the channel, to compute unread.
    const { data: membership } = await client
      .from("chat_channel_members")
      .select("last_read_at")
      .eq("channel_id", ch.id)
      .eq("member_kind", "admin")
      .eq("member_id", adminId)
      .maybeSingle();
    const lastReadAt = (membership as { last_read_at?: string | null } | null)?.last_read_at ?? null;

    // Newest message timestamp (for ordering + the row preview time).
    const { data: lastMsg } = await client
      .from("chat_messages")
      .select("created_at")
      .eq("channel_id", ch.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMessageAt = (lastMsg as { created_at?: string } | null)?.created_at ?? null;

    // Unread: messages after this admin's last_read_at (all if never read).
    let unreadQuery = client
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", ch.id)
      .is("deleted_at", null);
    if (lastReadAt) unreadQuery = unreadQuery.gt("created_at", lastReadAt);
    const { count } = await unreadQuery;

    threads.push({
      channelId: ch.id,
      tenantId: ch.tenant_id,
      tenantName: ch.tenants?.name ?? "Unknown",
      personName,
      unread: count ?? 0,
      lastMessageAt,
    });
  }

  threads.sort((a, b) => {
    const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bt - at;
  });

  return Response.json({ threads });
};
```

### 3. `functions/api/admin/messages/[channelId]/messages.ts` - read a thread

`GET /api/admin/messages/[channelId]/messages`. Admin only. Verify the channel is
`kind='hauck'` (an admin must not pull arbitrary channels through this route), return
its messages oldest-first as `ChatMessageDTO[]`, and set this admin's
`last_read_at=now()` for the channel so the inbox unread badge clears.

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// Mirrors ChatMessageDTO in src/lib/api.ts. Attachments are not surfaced on the
// admin reply view in this phase, so the array is always empty here.
interface ChatMessageDTO {
  id: string;
  channelId: string;
  senderKind: "staff" | "admin";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: never[];
}

interface MessageRow {
  id: string;
  channel_id: string;
  sender_kind: "staff" | "admin";
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  staff_accounts: { name: string } | null;
  admin_accounts: { name: string } | null;
}

function toDTO(row: MessageRow): ChatMessageDTO {
  const senderName =
    row.sender_kind === "admin"
      ? row.admin_accounts?.name ?? "Hauck"
      : row.staff_accounts?.name ?? "Member";
  return {
    id: row.id,
    channelId: row.channel_id,
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    senderName,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    attachments: [],
  };
}

// GET /api/admin/messages/:channelId/messages  (admin-only)
export const onRequestGet: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const channelId = ctx.params.channelId as string;
  const adminId = ctx.data.admin!.id;

  const { data: channel } = await client
    .from("chat_channels")
    .select("id, kind")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || (channel as { kind: string }).kind !== "hauck") {
    return Response.json({ error: "not a hauck thread" }, { status: 404 });
  }

  const { data, error } = await client
    .from("chat_messages")
    .select(
      "id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at, staff_accounts(name), admin_accounts(name)",
    )
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const messages = ((data ?? []) as unknown as MessageRow[]).map(toDTO);

  // Mark this admin's copy of the thread read.
  await client
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("member_kind", "admin")
    .eq("member_id", adminId);

  return Response.json({ messages });
};
```

Note: the `staff_accounts(name), admin_accounts(name)` embeds assume the sender
join keys on `chat_messages`. If PostgREST cannot infer both relationships in one
select (two possible foreign tables), fall back to two lookups keyed on
`sender_kind`, exactly as the inbox list resolves `personName`. Do not invent
columns.

### 4. `functions/api/admin/messages/[channelId]/send.ts` - admin reply

`POST /api/admin/messages/[channelId]/send { body }`. Admin only. Verify the
channel is `kind='hauck'`, insert a message with `sender_kind='admin'`,
`sender_id=ctx.data.admin.id`, then fire a notify ping to the non-admin (staff)
member through `notifyParticipants` so the client refetches. Never block the
response on delivery: use `ctx.waitUntil(...)` (the `lead.note` pattern from
`functions/api/leads/[id].ts`). Return the new message as a `ChatMessageDTO`.

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { notifyParticipants } from "../../../../lib/chatRealtime";

interface SendBody {
  body?: string;
}

interface ChatMessageDTO {
  id: string;
  channelId: string;
  senderKind: "staff" | "admin";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: never[];
}

// POST /api/admin/messages/:channelId/send  (admin-only)
export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const channelId = ctx.params.channelId as string;
  const admin = ctx.data.admin!;

  let payload: SendBody = {};
  try {
    payload = (await ctx.request.json()) as SendBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (payload.body ?? "").trim();
  if (!text) return Response.json({ error: "body is required" }, { status: 400 });

  // Guard: only Hauck threads, and capture the tenant id for the insert.
  const { data: channel } = await client
    .from("chat_channels")
    .select("id, kind, tenant_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || (channel as { kind: string }).kind !== "hauck") {
    return Response.json({ error: "not a hauck thread" }, { status: 404 });
  }
  const tenantId = (channel as { tenant_id: string }).tenant_id;

  const { data: inserted, error } = await client
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      tenant_id: tenantId,
      sender_kind: "admin",
      sender_id: admin.id,
      body: text,
    })
    .select("id, created_at, edited_at, deleted_at")
    .single();
  if (error || !inserted) {
    return Response.json({ error: error?.message ?? "could not send" }, { status: 500 });
  }
  const row = inserted as {
    id: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };

  // Notify the one non-admin member so their browser refetches the thread.
  const { data: staffMembers } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId)
    .eq("member_kind", "staff");
  const recipients = ((staffMembers ?? []) as { member_kind: string; member_id: string }[]).map(
    (m) => ({ kind: m.member_kind, id: m.member_id }),
  );
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId }));

  const message: ChatMessageDTO = {
    id: row.id,
    channelId,
    senderKind: "admin",
    senderId: admin.id,
    senderName: admin.name,
    body: text,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    attachments: [],
  };
  return Response.json({ message }, { status: 201 });
};
```

### 5. Commit (endpoints)

```bash
git add command-center/app/functions/api/chat/hauck.ts \
  command-center/app/functions/api/admin/messages/index.ts \
  "command-center/app/functions/api/admin/messages/[channelId]/messages.ts" \
  "command-center/app/functions/api/admin/messages/[channelId]/send.ts"
git commit -m "feat(comms): hauck channel get-or-create + admin messages endpoints"
```

### 6. `src/hooks/useChat.ts` - client + admin hooks

Add these to the existing `useChat.ts` (created in Phase 04). Same TanStack Query v5
style as the rest of the file: `api<T>(path)` for transport, `useQuery` /
`useMutation`, invalidate the relevant key on a successful send. Import
`ChatChannel`, `ChatMessageDTO`, `AdminHauckThread` from `../lib/api` (the frozen
types). Query keys come straight from the INDEX:
`["admin","messages"]` and `["admin","message", channelId]`.

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ChatChannel,
  type ChatMessageDTO,
  type AdminHauckThread,
} from "../lib/api";

// --- Client: open (get-or-create) the caller's Hauck line ----------------------

// A mutation, not a query: opening the line is an explicit user action (tapping
// "Message Hauck") and is allowed to create the channel server-side.
export function useOpenHauck() {
  return useMutation({
    mutationFn: () =>
      api<{ channel: ChatChannel }>("/api/chat/hauck").then((r) => r.channel),
  });
}

// --- Admin: the Hauck inbox ----------------------------------------------------

export function useAdminThreads() {
  return useQuery({
    queryKey: ["admin", "messages"],
    queryFn: () =>
      api<{ threads: AdminHauckThread[] }>("/api/admin/messages").then((r) => r.threads),
  });
}

export function useAdminThreadMessages(channelId: string | null) {
  return useQuery({
    queryKey: ["admin", "message", channelId],
    enabled: Boolean(channelId),
    queryFn: () =>
      api<{ messages: ChatMessageDTO[] }>(
        `/api/admin/messages/${channelId}/messages`,
      ).then((r) => r.messages),
  });
}

export function useAdminSendMessage(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<{ message: ChatMessageDTO }>(`/api/admin/messages/${channelId}/send`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }).then((r) => r.message),
    onSuccess: () => {
      // Refresh the open thread and the inbox row order/preview.
      void qc.invalidateQueries({ queryKey: ["admin", "message", channelId] });
      void qc.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
  });
}
```

If `useChat.ts` already imports from `@tanstack/react-query` and `../lib/api`,
extend the existing import lines instead of adding duplicates. Reading the thread
already marks it read server-side (endpoint 3); opening a thread therefore also
warrants invalidating `["admin","messages"]` so the unread badge clears. Do that in
`AdminMessages.tsx` when a thread is selected (below), not inside the query, to keep
the read query a pure GET.

### 7. `src/routes/admin/AdminMessages.tsx` - the admin inbox

Two-pane inbox: a thread list on the left, the selected conversation on the right.
Wrap the whole thing in `DesktopPage` with `title="Messages"`. Use the new hooks.
Use `Button` from `../../components/ui/Button` for the send action. Tailwind v4
theme tokens only (`bg-surface`, `border-border`, `text-text`, `text-muted`,
`bg-brand`, etc.), matching the other admin pages. No em dashes in any UI string.

```tsx
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import {
  useAdminThreads,
  useAdminThreadMessages,
  useAdminSendMessage,
} from "../../hooks/useChat";

// Jake's cross-tenant Hauck inbox. Left: every Hauck thread, newest first, with an
// unread badge. Right: the selected conversation plus a reply composer. Opening a
// thread marks it read on the server (the messages GET), so we refresh the inbox
// to clear the badge.
export default function AdminMessages() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const threads = useAdminThreads();
  const messages = useAdminThreadMessages(selected);
  const send = useAdminSendMessage(selected);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message whenever the open thread changes or grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data, selected]);

  function openThread(channelId: string) {
    setSelected(channelId);
    // The read mark happens in the GET; refresh the list so the badge clears.
    void qc.invalidateQueries({ queryKey: ["admin", "messages"] });
  }

  async function submit() {
    const body = draft.trim();
    if (!body || !selected) return;
    setDraft("");
    try {
      await send.mutateAsync(body);
    } catch {
      // Restore the draft so a failed send is not silently lost.
      setDraft(body);
    }
  }

  const list = threads.data ?? [];
  const active = list.find((t) => t.channelId === selected) ?? null;

  return (
    <DesktopPage title="Messages">
      <div className="grid h-[calc(100dvh-12rem)] grid-cols-[320px_1fr] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {/* Thread list */}
        <aside className="flex flex-col overflow-y-auto border-r border-border">
          {threads.isLoading && (
            <div className="p-5 text-[13px] text-muted">Loading threads...</div>
          )}
          {!threads.isLoading && list.length === 0 && (
            <div className="p-5 text-[13px] text-muted">No Hauck threads yet.</div>
          )}
          {list.map((t) => {
            const isActive = t.channelId === selected;
            return (
              <button
                key={t.channelId}
                type="button"
                onClick={() => openThread(t.channelId)}
                className={[
                  "flex flex-col gap-1 border-b border-divider px-4 py-3 text-left transition-colors",
                  isActive ? "bg-brand-tint" : "hover:bg-surface-2",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-[14px] font-semibold text-text">
                    {t.personName}
                  </span>
                  {t.unread > 0 && (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-fg">
                      {t.unread}
                    </span>
                  )}
                </div>
                <span className="truncate text-[12px] text-muted">{t.tenantName}</span>
                {t.lastMessageAt && (
                  <span className="text-[11px] text-faint">{formatTime(t.lastMessageAt)}</span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Conversation */}
        <section className="flex min-w-0 flex-col">
          {!active ? (
            <div className="grid flex-1 place-items-center text-[13px] text-muted">
              Select a thread to read and reply.
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-display text-[15px] font-semibold text-text">
                    {active.personName}
                  </div>
                  <div className="truncate text-[12px] text-muted">{active.tenantName}</div>
                </div>
              </header>

              <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
                {messages.isLoading && (
                  <div className="text-[13px] text-muted">Loading messages...</div>
                )}
                {(messages.data ?? []).map((m) => {
                  const mine = m.senderKind === "admin";
                  return (
                    <div
                      key={m.id}
                      className={["flex flex-col gap-0.5", mine ? "items-end" : "items-start"].join(" ")}
                    >
                      <div
                        className={[
                          "max-w-[78%] rounded-[var(--radius)] px-3.5 py-2 text-[14px] leading-snug",
                          mine
                            ? "bg-brand text-brand-fg"
                            : "bg-surface-2 text-text",
                        ].join(" ")}
                      >
                        {m.body}
                      </div>
                      <span className="px-1 text-[11px] text-faint">
                        {m.senderName} - {formatTime(m.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-end gap-2 border-t border-border px-4 py-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="Reply to this client..."
                  rows={1}
                  className="max-h-32 min-h-9.5 flex-1 resize-none rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-[14px] text-text outline-none placeholder:text-faint focus:border-brand"
                />
                <Button
                  variant="primary"
                  onClick={() => void submit()}
                  loading={send.isPending}
                  disabled={!draft.trim()}
                >
                  Send
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </DesktopPage>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

### 8. `src/App.tsx` - register the route

Add the import next to the other admin route imports (after `Assets`):
```tsx
import AdminMessages from "./routes/admin/AdminMessages";
```
Add the route inside `<Routes>`, alongside the other `/admin/*` entries (for
example right after the `/admin/tasks` route):
```tsx
<Route
  path="/admin/messages"
  element={
    <AdminRoute>
      <AdminMessages />
    </AdminRoute>
  }
/>
```

### 9. `src/routes/admin/AdminLayout.tsx` - add the nav item

Add `MessageSquare` to the existing `lucide-react` import:
```tsx
import {
  Building2,
  ListChecks,
  BookText,
  Hammer,
  FolderOpen,
  MessageSquare,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
```
Add the item to `ADMIN_NAV` (place it after Tasks so it reads Clients, Messages,
Tasks, ... or wherever Jake prefers; keep it above Build Lab):
```tsx
const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin/clients", label: "Clients", icon: Building2 },
  { to: "/admin/messages", label: "Messages", icon: MessageSquare },
  { to: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/build", label: "Build Lab", icon: Hammer },
  { to: "/admin/sops", label: "SOP Hub", icon: BookText },
  { to: "/admin/assets", label: "Assets", icon: FolderOpen },
];
```

### 10. Commit (UI + hooks)

```bash
git add command-center/app/src/hooks/useChat.ts \
  command-center/app/src/routes/admin/AdminMessages.tsx \
  command-center/app/src/App.tsx \
  command-center/app/src/routes/admin/AdminLayout.tsx
git commit -m "feat(comms): admin messages inbox page, hauck hooks, route + nav"
```

## Visual verification
Run it; do not claim "should work" (Spine: Verify, M9).

1. `cd command-center/app && npm run dev` (or the project's dev command). If a dev
   server is already bound, stop it first.
2. Log in as an admin (super-admin account). Open `/admin/messages`. Confirm the
   Messages item is in the admin rail and the page renders the two-pane inbox.
   Playwright screenshot the inbox empty state.
3. In a second session, log in as a client owner (a tenant whose owner has an
   individual `staff_accounts` row, per the Phase 02 owner-identity check). Trigger
   "Message Hauck" (the client-side entry point that calls `useOpenHauck`). Confirm
   the Hauck channel opens with name "Hauck". Send a message.
4. Back in the admin session, refetch `/admin/messages`. Confirm the new thread
   appears with the client's name + tenant and an unread badge. Open it: the client
   message shows, the unread badge clears. Playwright screenshot the open thread.
5. Reply from the admin composer. Confirm the reply appears in the admin thread,
   then confirm it arrives in the client's Hauck channel (notify-then-fetch). Save a
   screenshot of the round trip.
6. Permission gate: log in as a staff member with `can_contact_hauck = false` and
   confirm `GET /api/chat/hauck` returns `403 { error: "hauck_not_allowed" }` (the
   client UI should hide or disable the entry point; the API must still reject it).

## Definition of done
- `GET /api/chat/hauck` get-or-creates a `kind='hauck'` channel for an allowed
  caller (owner or `can_contact_hauck`), members = caller + every active admin,
  name "Hauck", and is idempotent. Disallowed callers get `403 hauck_not_allowed`.
- `GET /api/admin/messages` returns every Hauck thread across all tenants with
  tenant name, the client's name, this admin's unread count, and `lastMessageAt`,
  ordered newest activity first.
- `GET /api/admin/messages/[channelId]/messages` returns the thread's messages and
  marks it read for the calling admin; rejects non-Hauck channels.
- `POST /api/admin/messages/[channelId]/send` inserts an `sender_kind='admin'`
  message and fires `notifyParticipants` to the client via `ctx.waitUntil`.
- `/admin/messages` is registered under `<AdminRoute>`, the Messages nav item is in
  `ADMIN_NAV`, and `AdminMessages.tsx` renders a working two-pane inbox using
  `useAdminThreads`, `useAdminThreadMessages`, `useAdminSendMessage`.
- `useOpenHauck` exists in `useChat.ts` and opens the client's Hauck line.
- A full round trip works in the running app, verified with screenshots. No em
  dashes anywhere.

## MANUAL ACTIONS - JAKE
1. Confirm you have an active row in `admin_accounts` (status `active`). The Hauck
   channel adds every active admin as a member, so if your admin account is missing
   or disabled, your messages will not reach you. If unsure, sign in to the admin
   console; reaching `/admin/clients` proves the account is active.
2. Confirm the test client owner you will use for verification has an individual
   `owner` `staff_accounts` row (Phase 02 check script). The shared-password owner
   session has no chat identity and cannot open a Hauck line.
3. Run the round trip yourself once it is built: open Message Hauck as the client,
   send a note, then reply from `/admin/messages` and confirm it lands back on the
   client. This is the one flow only you can fully validate against real accounts.
