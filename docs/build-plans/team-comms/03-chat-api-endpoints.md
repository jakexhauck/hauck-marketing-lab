# Phase 03 - Chat API Endpoints

**Read `00-INDEX.md` and `02-backend-libs-and-realtime.md` first.** Address Jake as
**"Sir"**. **No em dashes.**

## Goal
Build the Cloudflare Pages Functions that power the comms panel: the roster, the
cosmetic roles CRUD (owner-gated), the channel list + creation + membership edits,
get-or-create DMs, message read + send + edit + soft-delete, and the read cursor.
Every write goes through the service-role client; every read enforces membership via
`isChannelMember`; every send pings recipients with `notifyParticipants` via
`ctx.waitUntil` so Realtime delivery never blocks the response. Message content is
returned by the endpoint, never broadcast (notify-then-fetch).

All endpoints live under `functions/api/chat/`. Chat paths carry no middleware rule,
so any signed-in staff or admin reaches them; owner-only management is gated
in-handler with `ctx.data.isOwner`. The hauck line, attachments, presence heartbeat,
and admin console endpoints are out of scope here (Phases 07 and 08).

## Files
- Create: `command-center/app/functions/api/chat/roster.ts`
- Create: `command-center/app/functions/api/chat/roles.ts`
- Create: `command-center/app/functions/api/chat/roles/[roleId].ts`
- Create: `command-center/app/functions/api/chat/channels.ts`
- Create: `command-center/app/functions/api/chat/channels/[channelId].ts`
- Create: `command-center/app/functions/api/chat/channels/[channelId]/messages.ts`
- Create: `command-center/app/functions/api/chat/channels/[channelId]/read.ts`
- Create: `command-center/app/functions/api/chat/dm.ts`
- Create: `command-center/app/functions/api/chat/messages/[messageId].ts`

DTO types (`ChatMember`, `ChatRole`, `ChatChannel`, `ChatMessageDTO`,
`ChatAttachment`) are frozen in `00-INDEX.md` and added to `src/lib/api.ts` in Phase
04. These handlers return objects of those exact shapes. No new shared type files
here; the handlers assemble plain objects matching the contract.

## Work

Conventions every handler in this phase follows (do not deviate):

- Handler shape: `export const onRequestGet: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {...}`.
  Use the param name for the folder (`"roleId"`, `"channelId"`, `"messageId"`), or
  `string` when there is no param (`roster.ts`, `roles.ts`, `channels.ts`, `dm.ts`).
- Types import: `import type { Env, ApiData } from "../../lib/env"` (adjust `../`
  depth by folder: two for `chat/`, three for `chat/roles/` and `chat/messages/`,
  four for `chat/channels/[channelId]/`).
- Body parse: `const body = await readJsonBody<T>(ctx.request); if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });`.
- DB + tenant boot (the first lines of nearly every handler):
  ```ts
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });
  ```
- Caller participant (any handler that acts as a person):
  ```ts
  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "forbidden" },
      { status: 403 },
    );
  }
  ```
- Owner gate (management endpoints): `if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });`.
- Realtime: `import { notifyParticipants } from "../../lib/chatRealtime"`, call as
  `ctx.waitUntil(notifyParticipants(ctx.env, recipients, {...}))`. Never await it in
  the request path.
- Responses: success `Response.json({ ...wrapperKey })`; errors
  `Response.json({ error: "snake_case" }, { status })`. On any Supabase error,
  `return Response.json({ error: error.message }, { status: 500 })`.

Because tenant resolution and participant resolution repeat, do them inline in each
handler (the codebase favors explicit boot lines over a shared wrapper). Keep the
order: client -> tenant -> participant -> work.

### 1. `functions/api/chat/roster.ts` - GET roster

Returns every staff member in the tenant with their joined cosmetic roles,
`can_contact_hauck`, and `lastSeen` from `chat_presence`. `online` is computed
client-side from the live presence set, so this endpoint always sets `online: false`.

Steps: load active staff for the tenant; load all `chat_roles` for the tenant (to map
ids to role DTOs); load `chat_member_roles` for those staff; load `chat_presence`
rows for the tenant keyed by `member_id`. Assemble one `ChatMember` per staff row.

```ts
import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface RoleRow {
  id: string;
  name: string;
  color: string;
  is_preset: boolean;
  sort_order: number;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const [staffRes, rolesRes, memberRolesRes, presenceRes] = await Promise.all([
    client
      .from("staff_accounts")
      .select("id, name, can_contact_hauck")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("name", { ascending: true }),
    client
      .from("chat_roles")
      .select("id, name, color, is_preset, sort_order")
      .eq("tenant_id", tenantId),
    client
      .from("chat_member_roles")
      .select("staff_account_id, chat_role_id"),
    client
      .from("chat_presence")
      .select("member_id, last_seen")
      .eq("tenant_id", tenantId)
      .eq("member_kind", "staff"),
  ]);

  if (staffRes.error) return Response.json({ error: staffRes.error.message }, { status: 500 });
  if (rolesRes.error) return Response.json({ error: rolesRes.error.message }, { status: 500 });
  if (memberRolesRes.error) return Response.json({ error: memberRolesRes.error.message }, { status: 500 });
  if (presenceRes.error) return Response.json({ error: presenceRes.error.message }, { status: 500 });

  const roleById = new Map<string, RoleRow>();
  for (const r of (rolesRes.data ?? []) as RoleRow[]) roleById.set(r.id, r);

  // staff_account_id -> [role DTO], sorted highest sort_order first.
  const rolesByStaff = new Map<string, RoleRow[]>();
  for (const link of (memberRolesRes.data ?? []) as { staff_account_id: string; chat_role_id: string }[]) {
    const role = roleById.get(link.chat_role_id);
    if (!role) continue;
    const list = rolesByStaff.get(link.staff_account_id) ?? [];
    list.push(role);
    rolesByStaff.set(link.staff_account_id, list);
  }

  const lastSeenById = new Map<string, string>();
  for (const p of (presenceRes.data ?? []) as { member_id: string; last_seen: string }[]) {
    lastSeenById.set(p.member_id, p.last_seen);
  }

  const members = ((staffRes.data ?? []) as { id: string; name: string; can_contact_hauck: boolean }[]).map(
    (s) => {
      const roles = (rolesByStaff.get(s.id) ?? [])
        .sort((a, b) => b.sort_order - a.sort_order)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          isPreset: r.is_preset,
          sortOrder: r.sort_order,
        }));
      return {
        id: s.id,
        name: s.name,
        roles,
        online: false,
        lastSeen: lastSeenById.get(s.id) ?? null,
        canContactHauck: Boolean(s.can_contact_hauck),
      };
    },
  );

  return Response.json({ members });
};
```

### 2. `functions/api/chat/roles.ts` - GET roles, POST create role (owner)

`GET` lists the tenant's roles ordered by `sort_order` desc. `POST` is owner-only:
insert a non-preset role with a name and color.

```ts
import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface CreateRoleBody {
  name?: string;
  color?: string;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  is_preset: boolean;
  sort_order: number;
}

function toRoleDTO(r: RoleRow) {
  return { id: r.id, name: r.name, color: r.color, isPreset: r.is_preset, sortOrder: r.sort_order };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { data, error } = await client
    .from("chat_roles")
    .select("id, name, color, is_preset, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .order("name", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ roles: ((data ?? []) as RoleRow[]).map(toRoleDTO) });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const body = await readJsonBody<CreateRoleBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const name = (body.name ?? "").trim();
  const color = (body.color ?? "").trim();
  if (!name || !color) return Response.json({ error: "name_and_color_required" }, { status: 400 });

  const { data, error } = await client
    .from("chat_roles")
    .insert({ tenant_id: tenantId, name, color, is_preset: false, sort_order: 0 })
    .select("id, name, color, is_preset, sort_order")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ role: toRoleDTO(data as RoleRow) });
};
```

### 3. `functions/api/chat/roles/[roleId].ts` - PATCH, DELETE role (owner)

Owner-only. `PATCH` updates `name`, `color`, and `sortOrder` (only the supplied
fields). `DELETE` refuses preset roles. Note: depth is three (`../../../lib/...`).

```ts
import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";

interface PatchRoleBody {
  name?: string;
  color?: string;
  sortOrder?: number;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  is_preset: boolean;
  sort_order: number;
}

function toRoleDTO(r: RoleRow) {
  return { id: r.id, name: r.name, color: r.color, isPreset: r.is_preset, sortOrder: r.sort_order };
}

export const onRequestPatch: PagesFunction<Env, "roleId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const roleId = ctx.params.roleId as string;
  const body = await readJsonBody<PatchRoleBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.color === "string") patch.color = body.color.trim();
  if (typeof body.sortOrder === "number") patch.sort_order = body.sortOrder;
  if (Object.keys(patch).length === 0) return Response.json({ error: "no_fields" }, { status: 400 });

  const { data, error } = await client
    .from("chat_roles")
    .update(patch)
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .select("id, name, color, is_preset, sort_order")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "role_not_found" }, { status: 404 });

  return Response.json({ role: toRoleDTO(data as RoleRow) });
};

export const onRequestDelete: PagesFunction<Env, "roleId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const roleId = ctx.params.roleId as string;

  // Load first so a preset role is refused with 409, not silently no-op deleted.
  const { data: existing, error: loadErr } = await client
    .from("chat_roles")
    .select("id, is_preset")
    .eq("id", roleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return Response.json({ error: "role_not_found" }, { status: 404 });
  if ((existing as { is_preset: boolean }).is_preset) {
    return Response.json({ error: "preset_role_undeletable" }, { status: 409 });
  }

  const { error } = await client
    .from("chat_roles")
    .delete()
    .eq("id", roleId)
    .eq("tenant_id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
```

Exact contract for the two roles endpoints above, restated tightly:
- `PATCH /api/chat/roles/[roleId]`: owner-only (403 `forbidden` otherwise); update
  only the supplied `name`/`color`/`sortOrder`; 400 `invalid_json` on bad body, 400
  `no_fields` if nothing to change, 404 `role_not_found` if no row in tenant; 200
  `{ role }`.
- `DELETE /api/chat/roles/[roleId]`: owner-only; 404 `role_not_found` if absent, 409
  `preset_role_undeletable` if `is_preset`; otherwise delete and 200 `{ ok: true }`.
  Member-role links cascade away via the FK on `chat_member_roles`.

### Commit (roster + roles)
```bash
git add command-center/app/functions/api/chat/roster.ts \
  command-center/app/functions/api/chat/roles.ts \
  command-center/app/functions/api/chat/roles/[roleId].ts
git commit -m "feat(comms): chat roster + cosmetic roles CRUD endpoints"
```

### 4. `functions/api/chat/channels.ts` - GET (caller's channels), POST (owner)

`GET` returns only channels the caller is a member of, each with `memberIds`,
`unread`, and `lastMessageAt`. `POST` is owner-only: create a `kind='channel'` channel
and add its members (plus the creator if missing).

Unread = count of non-deleted messages in the channel created after the caller's
`last_read_at` (or all of them when `last_read_at` is null), excluding the caller's
own sends. `lastMessageAt` = newest non-deleted message `created_at`, or null.

```ts
import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

interface CreateChannelBody {
  name?: string;
  memberIds?: string[];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "forbidden" },
      { status: 403 },
    );
  }

  // Channels the caller belongs to, with their read cursor.
  const { data: myMemberships, error: memErr } = await client
    .from("chat_channel_members")
    .select("channel_id, last_read_at")
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id);
  if (memErr) return Response.json({ error: memErr.message }, { status: 500 });

  const channelIds = ((myMemberships ?? []) as { channel_id: string }[]).map((m) => m.channel_id);
  if (channelIds.length === 0) return Response.json({ channels: [] });

  const lastReadByChannel = new Map<string, string | null>();
  for (const m of (myMemberships ?? []) as { channel_id: string; last_read_at: string | null }[]) {
    lastReadByChannel.set(m.channel_id, m.last_read_at);
  }

  const [channelsRes, membersRes, messagesRes] = await Promise.all([
    client
      .from("chat_channels")
      .select("id, kind, name, archived")
      .eq("tenant_id", tenantId)
      .in("id", channelIds),
    client
      .from("chat_channel_members")
      .select("channel_id, member_kind, member_id")
      .in("channel_id", channelIds),
    client
      .from("chat_messages")
      .select("channel_id, sender_kind, sender_id, created_at, deleted_at")
      .in("channel_id", channelIds)
      .is("deleted_at", null),
  ]);
  if (channelsRes.error) return Response.json({ error: channelsRes.error.message }, { status: 500 });
  if (membersRes.error) return Response.json({ error: membersRes.error.message }, { status: 500 });
  if (messagesRes.error) return Response.json({ error: messagesRes.error.message }, { status: 500 });

  // Member ids per channel (only staff/admin member_ids; mixed kinds are flattened
  // to ids, which is what the client roster keys on).
  const memberIdsByChannel = new Map<string, string[]>();
  for (const m of (membersRes.data ?? []) as { channel_id: string; member_id: string }[]) {
    const list = memberIdsByChannel.get(m.channel_id) ?? [];
    list.push(m.member_id);
    memberIdsByChannel.set(m.channel_id, list);
  }

  const lastAtByChannel = new Map<string, string>();
  const unreadByChannel = new Map<string, number>();
  for (const msg of (messagesRes.data ?? []) as {
    channel_id: string;
    sender_kind: string;
    sender_id: string;
    created_at: string;
  }[]) {
    const prev = lastAtByChannel.get(msg.channel_id);
    if (!prev || msg.created_at > prev) lastAtByChannel.set(msg.channel_id, msg.created_at);

    const lastRead = lastReadByChannel.get(msg.channel_id) ?? null;
    const isOwnSend = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
    const isUnread = !isOwnSend && (lastRead === null || msg.created_at > lastRead);
    if (isUnread) unreadByChannel.set(msg.channel_id, (unreadByChannel.get(msg.channel_id) ?? 0) + 1);
  }

  const channels = ((channelsRes.data ?? []) as {
    id: string;
    kind: "channel" | "dm" | "hauck";
    name: string;
    archived: boolean;
  }[]).map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    memberIds: memberIdsByChannel.get(c.id) ?? [],
    unread: unreadByChannel.get(c.id) ?? 0,
    lastMessageAt: lastAtByChannel.get(c.id) ?? null,
  }));

  return Response.json({ channels });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const body = await readJsonBody<CreateChannelBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name_required" }, { status: 400 });
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id) => typeof id === "string") : [];

  // Confirm every member id is an active staff row in this tenant.
  let validStaffIds: string[] = [];
  if (memberIds.length > 0) {
    const { data: staffRows, error: staffErr } = await client
      .from("staff_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", memberIds);
    if (staffErr) return Response.json({ error: staffErr.message }, { status: 500 });
    validStaffIds = ((staffRows ?? []) as { id: string }[]).map((s) => s.id);
  }

  const { data: created, error: chErr } = await client
    .from("chat_channels")
    .insert({
      tenant_id: tenantId,
      name,
      kind: "channel",
      created_by_kind: participant.kind,
      created_by_id: participant.id,
    })
    .select("id, kind, name, archived")
    .single();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  const channel = created as { id: string; kind: "channel" | "dm" | "hauck"; name: string };

  // Members: the supplied staff plus the creator (deduped).
  const memberRows = new Map<string, { member_kind: string; member_id: string }>();
  for (const id of validStaffIds) memberRows.set(`staff:${id}`, { member_kind: "staff", member_id: id });
  memberRows.set(`${participant.kind}:${participant.id}`, {
    member_kind: participant.kind,
    member_id: participant.id,
  });

  const { error: insErr } = await client.from("chat_channel_members").insert(
    [...memberRows.values()].map((m) => ({
      channel_id: channel.id,
      member_kind: m.member_kind,
      member_id: m.member_id,
    })),
  );
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({
    channel: {
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      memberIds: [...memberRows.values()].map((m) => m.member_id),
      unread: 0,
      lastMessageAt: null,
    },
  });
};
```

### 5. `functions/api/chat/channels/[channelId].ts` - PATCH channel (owner)

Owner-only. Rename, archive/unarchive, or replace the membership set. Depth is four
(`../../../../lib/...`). When `memberIds` is supplied, the new set fully replaces the
existing members, but the creator is always retained so the owner is never locked out.

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";

interface PatchChannelBody {
  name?: string;
  archived?: boolean;
  memberIds?: string[];
}

export const onRequestPatch: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) return Response.json({ error: "forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const channelId = ctx.params.channelId as string;
  const body = await readJsonBody<PatchChannelBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  // Confirm the channel exists in this tenant and is a managed channel (not a dm/hauck).
  const { data: chRow, error: chErr } = await client
    .from("chat_channels")
    .select("id, kind, created_by_kind, created_by_id")
    .eq("id", channelId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  if (!chRow) return Response.json({ error: "channel_not_found" }, { status: 404 });
  const channel = chRow as {
    id: string;
    kind: "channel" | "dm" | "hauck";
    created_by_kind: string | null;
    created_by_id: string | null;
  };
  if (channel.kind !== "channel") {
    return Response.json({ error: "not_a_managed_channel" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await client
      .from("chat_channels")
      .update(patch)
      .eq("id", channelId)
      .eq("tenant_id", tenantId);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  }

  // Membership replacement (only when memberIds was supplied).
  if (Array.isArray(body.memberIds)) {
    const requested = body.memberIds.filter((id) => typeof id === "string");

    const { data: staffRows, error: staffErr } = await client
      .from("staff_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", requested.length > 0 ? requested : ["00000000-0000-0000-0000-000000000000"]);
    if (staffErr) return Response.json({ error: staffErr.message }, { status: 500 });
    const validStaffIds = new Set(((staffRows ?? []) as { id: string }[]).map((s) => s.id));

    const keep = new Map<string, { member_kind: string; member_id: string }>();
    for (const id of requested) {
      if (validStaffIds.has(id)) keep.set(`staff:${id}`, { member_kind: "staff", member_id: id });
    }
    // Never drop the creator.
    if (channel.created_by_kind && channel.created_by_id) {
      keep.set(`${channel.created_by_kind}:${channel.created_by_id}`, {
        member_kind: channel.created_by_kind,
        member_id: channel.created_by_id,
      });
    }

    const { error: delErr } = await client
      .from("chat_channel_members")
      .delete()
      .eq("channel_id", channelId);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    const rows = [...keep.values()].map((m) => ({
      channel_id: channelId,
      member_kind: m.member_kind,
      member_id: m.member_id,
    }));
    if (rows.length > 0) {
      const { error: insErr } = await client.from("chat_channel_members").insert(rows);
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
};
```

### 6. `functions/api/chat/dm.ts` - POST get-or-create a DM

Find the existing `kind='dm'` channel whose member set is exactly the caller and the
target, or create one. Both must be active staff in the same tenant. Depth is two.

The lookup: find every `dm` channel the caller belongs to, then keep the one whose
membership is exactly the two participants. If none, create.

```ts
import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { resolveParticipant } from "../../lib/participants";

interface DmBody {
  memberId?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant, needsIndividualAccount } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "forbidden" },
      { status: 403 },
    );
  }

  const body = await readJsonBody<DmBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const targetId = (body.memberId ?? "").trim();
  if (!targetId) return Response.json({ error: "member_id_required" }, { status: 400 });
  if (targetId === participant.id) return Response.json({ error: "cannot_dm_self" }, { status: 400 });

  // Target must be an active staff row in the same tenant.
  const { data: target, error: targetErr } = await client
    .from("staff_accounts")
    .select("id")
    .eq("id", targetId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (targetErr) return Response.json({ error: targetErr.message }, { status: 500 });
  if (!target) return Response.json({ error: "member_not_found" }, { status: 404 });

  // Existing dm: a dm channel the caller belongs to whose membership is exactly the pair.
  const { data: myDmMemberships, error: memErr } = await client
    .from("chat_channel_members")
    .select("channel_id, chat_channels!inner(id, kind, tenant_id)")
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id)
    .eq("chat_channels.kind", "dm")
    .eq("chat_channels.tenant_id", tenantId);
  if (memErr) return Response.json({ error: memErr.message }, { status: 500 });

  const candidateIds = ((myDmMemberships ?? []) as { channel_id: string }[]).map((m) => m.channel_id);
  if (candidateIds.length > 0) {
    const { data: allMembers, error: amErr } = await client
      .from("chat_channel_members")
      .select("channel_id, member_kind, member_id")
      .in("channel_id", candidateIds);
    if (amErr) return Response.json({ error: amErr.message }, { status: 500 });

    const byChannel = new Map<string, Set<string>>();
    for (const m of (allMembers ?? []) as { channel_id: string; member_kind: string; member_id: string }[]) {
      const set = byChannel.get(m.channel_id) ?? new Set<string>();
      set.add(`${m.member_kind}:${m.member_id}`);
      byChannel.set(m.channel_id, set);
    }
    const want = new Set([`${participant.kind}:${participant.id}`, `staff:${targetId}`]);
    for (const [cid, set] of byChannel) {
      if (set.size === 2 && [...want].every((k) => set.has(k))) {
        return Response.json({
          channel: { id: cid, kind: "dm", name: "", memberIds: [participant.id, targetId], unread: 0, lastMessageAt: null },
        });
      }
    }
  }

  // Create the dm and both memberships.
  const { data: created, error: chErr } = await client
    .from("chat_channels")
    .insert({
      tenant_id: tenantId,
      name: "",
      kind: "dm",
      created_by_kind: participant.kind,
      created_by_id: participant.id,
    })
    .select("id")
    .single();
  if (chErr) return Response.json({ error: chErr.message }, { status: 500 });
  const channelId = (created as { id: string }).id;

  const { error: insErr } = await client.from("chat_channel_members").insert([
    { channel_id: channelId, member_kind: participant.kind, member_id: participant.id },
    { channel_id: channelId, member_kind: "staff", member_id: targetId },
  ]);
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({
    channel: { id: channelId, kind: "dm", name: "", memberIds: [participant.id, targetId], unread: 0, lastMessageAt: null },
  });
};
```

### Commit (channels + dm)
```bash
git add command-center/app/functions/api/chat/channels.ts \
  command-center/app/functions/api/chat/channels/[channelId].ts \
  command-center/app/functions/api/chat/dm.ts
git commit -m "feat(comms): chat channels list/create/edit + get-or-create DM endpoints"
```

### 7. `functions/api/chat/channels/[channelId]/messages.ts` - GET history, POST send

Both enforce membership via `isChannelMember`. Depth is four (`../../../../lib/...`).

`GET` returns up to 50 non-deleted-or-soft-deleted messages oldest-first for render,
paginating backward with `?before=ISO` (messages strictly older than that cursor). It
joins sender name (from `staff_accounts.name` or `admin_accounts.name` by
`sender_kind`) and attachments. Soft-deleted messages are returned with empty body so
the client can render a "message deleted" tombstone; keep `deletedAt` set.

`POST` inserts a message, attaches any `attachmentIds` that belong to the tenant and
are not yet linked, then pings the other members with `ctx.waitUntil`.

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../../lib/participants";
import { notifyParticipants } from "../../../../lib/chatRealtime";

const PAGE_SIZE = 50;

interface SendBody {
  body?: string;
  attachmentIds?: string[];
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
}

interface AttachmentRow {
  id: string;
  message_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

function attachmentDTO(a: AttachmentRow) {
  return {
    id: a.id,
    fileName: a.file_name,
    mimeType: a.mime_type,
    sizeBytes: Number(a.size_bytes),
    width: a.width,
    height: a.height,
  };
}

export const onRequestGet: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const before = new URL(ctx.request.url).searchParams.get("before");

  let query = client
    .from("chat_messages")
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const msgRows = ((rows ?? []) as MessageRow[]).slice().reverse(); // oldest-first for render

  // Resolve sender names: split ids by kind, look up both tables once.
  const staffIds = [...new Set(msgRows.filter((m) => m.sender_kind === "staff").map((m) => m.sender_id))];
  const adminIds = [...new Set(msgRows.filter((m) => m.sender_kind === "admin").map((m) => m.sender_id))];
  const nameByKey = new Map<string, string>();

  const lookups: Promise<unknown>[] = [];
  if (staffIds.length > 0) {
    lookups.push(
      client
        .from("staff_accounts")
        .select("id, name")
        .in("id", staffIds)
        .then(({ data }) => {
          for (const s of (data ?? []) as { id: string; name: string }[]) nameByKey.set(`staff:${s.id}`, s.name);
        }),
    );
  }
  if (adminIds.length > 0) {
    lookups.push(
      client
        .from("admin_accounts")
        .select("id, name")
        .in("id", adminIds)
        .then(({ data }) => {
          for (const a of (data ?? []) as { id: string; name: string }[]) nameByKey.set(`admin:${a.id}`, a.name);
        }),
    );
  }

  // Attachments for the page (only for non-deleted messages).
  const liveMessageIds = msgRows.filter((m) => !m.deleted_at).map((m) => m.id);
  const attByMessage = new Map<string, AttachmentRow[]>();
  if (liveMessageIds.length > 0) {
    lookups.push(
      client
        .from("chat_attachments")
        .select("id, message_id, file_name, mime_type, size_bytes, width, height")
        .in("message_id", liveMessageIds)
        .then(({ data }) => {
          for (const a of (data ?? []) as AttachmentRow[]) {
            if (!a.message_id) continue;
            const list = attByMessage.get(a.message_id) ?? [];
            list.push(a);
            attByMessage.set(a.message_id, list);
          }
        }),
    );
  }
  await Promise.all(lookups);

  const messages = msgRows.map((m) => ({
    id: m.id,
    channelId: m.channel_id,
    senderKind: m.sender_kind,
    senderId: m.sender_id,
    senderName: nameByKey.get(`${m.sender_kind}:${m.sender_id}`) ?? "Unknown",
    body: m.deleted_at ? "" : m.body,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
    attachments: m.deleted_at ? [] : (attByMessage.get(m.id) ?? []).map(attachmentDTO),
  }));

  return Response.json({ messages });
};

export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const body = await readJsonBody<SendBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const text = (body.body ?? "").trim();
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id) => typeof id === "string")
    : [];
  if (!text && attachmentIds.length === 0) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await client
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      tenant_id: tenantId,
      sender_kind: participant.kind,
      sender_id: participant.id,
      body: text,
    })
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .single();
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  const message = inserted as MessageRow;

  // Link attachments that belong to this tenant and are not yet attached.
  let attachmentDTOs: ReturnType<typeof attachmentDTO>[] = [];
  if (attachmentIds.length > 0) {
    const { data: linked, error: attErr } = await client
      .from("chat_attachments")
      .update({ message_id: message.id })
      .in("id", attachmentIds)
      .eq("tenant_id", tenantId)
      .is("message_id", null)
      .select("id, message_id, file_name, mime_type, size_bytes, width, height");
    if (attErr) return Response.json({ error: attErr.message }, { status: 500 });
    attachmentDTOs = ((linked ?? []) as AttachmentRow[]).map(attachmentDTO);
  }

  // Ping the other members (notify only, no content). Never blocks the response.
  const { data: members } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId);
  const recipients = ((members ?? []) as { member_kind: string; member_id: string }[])
    .filter((m) => !(m.member_kind === participant.kind && m.member_id === participant.id))
    .map((m) => ({ kind: m.member_kind, id: m.member_id }));
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId }));

  return Response.json({
    message: {
      id: message.id,
      channelId: message.channel_id,
      senderKind: message.sender_kind,
      senderId: message.sender_id,
      senderName: participant.name,
      body: message.body,
      createdAt: message.created_at,
      editedAt: message.edited_at,
      deletedAt: message.deleted_at,
      attachments: attachmentDTOs,
    },
  });
};
```

### 8. `functions/api/chat/channels/[channelId]/read.ts` - POST mark read

Set the caller's `last_read_at = now()` on `chat_channel_members`, then ping the
channel members with a `read` event so other tabs can refresh unread badges. Depth is
four.

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../../lib/participants";
import { notifyParticipants } from "../../../../lib/chatRealtime";

export const onRequestPost: PagesFunction<Env, "channelId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const channelId = ctx.params.channelId as string;
  if (!(await isChannelMember(client, channelId, participant))) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }

  const { error } = await client
    .from("chat_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("member_kind", participant.kind)
    .eq("member_id", participant.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Ping only the caller's other sessions; the read state is personal.
  ctx.waitUntil(
    notifyParticipants(ctx.env, [{ kind: participant.kind, id: participant.id }], {
      kind: "read",
      channelId,
    }),
  );

  return Response.json({ ok: true });
};
```

### 9. `functions/api/chat/messages/[messageId].ts` - PATCH edit, DELETE

`PATCH` is author-only: set `body` and `edited_at`. `DELETE` is author OR tenant owner
(`ctx.data.isOwner`): soft-delete by setting `deleted_at`, `deleted_by_kind`,
`deleted_by_id`. Depth is three (`../../../lib/...`). Both ping the channel members so
edits and tombstones propagate.

```ts
import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";
import { notifyParticipants } from "../../../lib/chatRealtime";

interface EditBody {
  body?: string;
}

interface MessageRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  sender_kind: "staff" | "admin";
  sender_id: string;
  deleted_at: string | null;
}

async function channelRecipients(
  client: ReturnType<typeof getServiceClient>,
  channelId: string,
  exclude: { kind: string; id: string },
): Promise<{ kind: string; id: string }[]> {
  if (!client) return [];
  const { data } = await client
    .from("chat_channel_members")
    .select("member_kind, member_id")
    .eq("channel_id", channelId);
  return ((data ?? []) as { member_kind: string; member_id: string }[])
    .filter((m) => !(m.member_kind === exclude.kind && m.member_id === exclude.id))
    .map((m) => ({ kind: m.member_kind, id: m.member_id }));
}

export const onRequestPatch: PagesFunction<Env, "messageId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const messageId = ctx.params.messageId as string;
  const body = await readJsonBody<EditBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const text = (body.body ?? "").trim();
  if (!text) return Response.json({ error: "empty_message" }, { status: 400 });

  const { data: msgRow, error: loadErr } = await client
    .from("chat_messages")
    .select("id, channel_id, tenant_id, sender_kind, sender_id, deleted_at")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!msgRow) return Response.json({ error: "message_not_found" }, { status: 404 });
  const msg = msgRow as MessageRow;
  if (msg.deleted_at) return Response.json({ error: "message_deleted" }, { status: 409 });

  const isAuthor = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
  if (!isAuthor) return Response.json({ error: "forbidden" }, { status: 403 });

  const { data: updated, error: updErr } = await client
    .from("chat_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id, channel_id, sender_kind, sender_id, body, created_at, edited_at, deleted_at")
    .single();
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  const u = updated as {
    id: string;
    channel_id: string;
    sender_kind: "staff" | "admin";
    sender_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };

  const recipients = await channelRecipients(client, msg.channel_id, {
    kind: participant.kind,
    id: participant.id,
  });
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId: msg.channel_id }));

  return Response.json({
    message: {
      id: u.id,
      channelId: u.channel_id,
      senderKind: u.sender_kind,
      senderId: u.sender_id,
      senderName: participant.name,
      body: u.body,
      createdAt: u.created_at,
      editedAt: u.edited_at,
      deletedAt: u.deleted_at,
      attachments: [],
    },
  });
};

export const onRequestDelete: PagesFunction<Env, "messageId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant_not_found" }, { status: 404 });

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) return Response.json({ error: "needs_individual_account" }, { status: 403 });

  const messageId = ctx.params.messageId as string;

  const { data: msgRow, error: loadErr } = await client
    .from("chat_messages")
    .select("id, channel_id, tenant_id, sender_kind, sender_id, deleted_at")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
  if (!msgRow) return Response.json({ error: "message_not_found" }, { status: 404 });
  const msg = msgRow as MessageRow;
  if (msg.deleted_at) return Response.json({ ok: true }); // already gone, idempotent

  const isAuthor = msg.sender_kind === participant.kind && msg.sender_id === participant.id;
  const isModerator = Boolean(ctx.data.isOwner);
  if (!isAuthor && !isModerator) return Response.json({ error: "forbidden" }, { status: 403 });

  const { error: updErr } = await client
    .from("chat_messages")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_kind: participant.kind,
      deleted_by_id: participant.id,
    })
    .eq("id", messageId);
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  const recipients = await channelRecipients(client, msg.channel_id, {
    kind: participant.kind,
    id: participant.id,
  });
  ctx.waitUntil(notifyParticipants(ctx.env, recipients, { kind: "message", channelId: msg.channel_id }));

  return Response.json({ ok: true });
};
```

### Commit (messages + read)
```bash
git add command-center/app/functions/api/chat/channels/[channelId]/messages.ts \
  command-center/app/functions/api/chat/channels/[channelId]/read.ts \
  command-center/app/functions/api/chat/messages/[messageId].ts
git commit -m "feat(comms): chat message history/send/read + edit/soft-delete endpoints"
```

## Tests
These are I/O endpoints, so they are verified by running them, not by Vitest (only
pure helpers in `src/lib/chatLogic.ts` get unit tests, per Phase 01). Verify with
`npm run dev` from `command-center/app`, signed in as an owner staff account:

- `curl -s http://localhost:8788/api/chat/roster` returns `{ members: [...] }` with
  joined roles and `online: false` on every member.
- `POST /api/chat/roles` as owner creates a role; as non-owner returns 403
  `forbidden`. `DELETE` a preset role returns 409 `preset_role_undeletable`.
- `POST /api/chat/channels { name, memberIds }` then `GET /api/chat/channels`: the new
  channel appears for members only, with `unread: 0`.
- `POST /api/chat/dm { memberId }` twice returns the same channel id (get-or-create).
- `POST /api/chat/channels/<id>/messages { body }` returns `{ message }`; `GET
  .../messages` returns it oldest-first with `senderName` populated; the other
  member's roster/channels query is invalidated by the Realtime ping (confirm in
  Phase 04 wiring). `POST .../read` then re-GET channels shows `unread: 0`.
- `PATCH /api/chat/messages/<id>` as a non-author returns 403; as author sets
  `editedAt`. `DELETE` as author or owner sets `deletedAt`; the message then renders
  with empty body in `GET .../messages`.

Capture a Playwright screenshot of the live panel once Phase 05 mounts the UI (M9);
no UI exists yet in this phase, so curl is the evidence here.

## Definition of done
- All nine endpoint files exist under `functions/api/chat/` with the exact handler
  shapes and import depths above; `npx tsc --noEmit` (or the build) is clean.
- Roster joins roles + presence and returns `online: false`. Roles CRUD is
  owner-gated and refuses deleting presets. Channels list is membership-scoped with
  correct `unread`/`lastMessageAt`. DM is get-or-create and idempotent. Messages
  enforce membership, return DTOs with `senderName` + attachments, ping recipients via
  `ctx.waitUntil`, and edit/delete respect author/owner rules.
- No column or type names invented beyond migration 0016 and the INDEX DTOs.

## MANUAL ACTIONS - JAKE
None. This phase is pure server code behind the existing auth + Supabase config set up
in Phases 01 and 02. The Realtime pings only fire once `SUPABASE_ANON_KEY` and
Realtime are enabled (already on Jake's list from Phase 02); the endpoints function
without them, they just skip the broadcast.
