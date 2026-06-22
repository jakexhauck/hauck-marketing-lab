# Phase 02 - Backend Libs and Realtime Transport

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Build the shared backend pieces every chat endpoint reuses: the participant
resolver, the membership check, the Realtime notify helper (server -> browser pings,
no content), and the `GET /api/chat/config` endpoint that hands the browser the
Realtime connection info. Also a one-off check that live tenants have individual
owner identities.

## Files
- Create: `command-center/app/functions/lib/participants.ts`
- Create: `command-center/app/functions/lib/chatRealtime.ts`
- Create: `command-center/app/functions/api/chat/config.ts`
- Create: `command-center/app/functions/api/chat/presence/heartbeat.ts`
- Create: `command-center/app/scripts/check-owner-identity.mjs`
- Modify: `command-center/app/functions/lib/env.ts` (add `SUPABASE_ANON_KEY` to `Env`)

## Work

### 1. `functions/lib/env.ts` - add the anon key

The browser Realtime socket needs the publishable anon key. Add to the `Env` type:
```ts
// Browser-safe publishable key, returned by /api/chat/config for the Realtime socket.
SUPABASE_ANON_KEY?: string;
```

### 2. `functions/lib/participants.ts`

Resolve the middleware-populated caller into a chat participant. Owners log in as a
`staff_accounts` row (migration 0010), so `ctx.data.staff` carries the id and name.
A legacy shared-owner session has `isOwner=true` but `staff=null`: it has no
individual identity and cannot be a chat participant.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRecord } from "./staff";
import type { AdminRecord } from "./adminAuth";
import { resolveTenantId } from "./supabase";

export type Participant = {
  kind: "staff" | "admin";
  id: string;
  tenantId: string | null;
  name: string;
};

// Turn the verified caller (set by _middleware) into a chat participant.
// needsIndividualAccount=true => a shared-owner session with no staff row; the
// caller must be given a personal owner account before they can use chat.
export async function resolveParticipant(
  client: SupabaseClient,
  ctx: { isOwner: boolean; staff: StaffRecord | null; admin: AdminRecord | null; tenantSlug: string },
): Promise<{ participant: Participant | null; needsIndividualAccount: boolean }> {
  if (ctx.admin) {
    return {
      participant: { kind: "admin", id: ctx.admin.id, tenantId: null, name: ctx.admin.name },
      needsIndividualAccount: false,
    };
  }
  if (ctx.staff) {
    return {
      participant: {
        kind: "staff", id: ctx.staff.id,
        tenantId: ctx.staff.tenant_id, name: ctx.staff.name,
      },
      needsIndividualAccount: false,
    };
  }
  // Shared-owner session (isOwner, no staff row): no individual identity.
  return { participant: null, needsIndividualAccount: ctx.isOwner };
}

export async function isChannelMember(
  client: SupabaseClient, channelId: string, p: Participant,
): Promise<boolean> {
  const { data } = await client
    .from("chat_channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("member_kind", p.kind)
    .eq("member_id", p.id)
    .maybeSingle();
  return Boolean(data);
}
```
Note: confirm `StaffRecord` exposes `tenant_id` and `name`. If not, read it in
`functions/lib/staff.ts` and use the actual field names. Do not invent fields.

### 3. `functions/lib/chatRealtime.ts`

Cloudflare Workers cannot hold a Realtime websocket, so the server publishes via
Supabase Realtime's HTTP broadcast API. The payload is a **notify ping only** (an
event kind + maybe a channel id), never message content. Each recipient browser
subscribes to its own person topic.

```ts
import type { Env } from "./env";

export type ChatRealtimeEvent = {
  kind: "message" | "read" | "channel" | "presence_dirty";
  channelId?: string;
};

export function personTopic(kind: string, id: string): string {
  return `chat:person:${kind}:${id}`;
}
export function tenantPresenceTopic(tenantId: string): string {
  return `chat:presence:${tenantId}`;
}

// Fire-and-forget: POST a broadcast per recipient to the Realtime HTTP API.
// Never throws into the request path; log and move on.
export async function notifyParticipants(
  env: Env,
  recipients: { kind: string; id: string }[],
  event: ChatRealtimeEvent,
): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || recipients.length === 0) return;
  const url = `${env.SUPABASE_URL}/realtime/v1/api/broadcast`;
  const messages = recipients.map((r) => ({
    topic: personTopic(r.kind, r.id),
    event: "chat",
    payload: event,
  }));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) console.warn("[chatRealtime] broadcast", res.status, await res.text());
  } catch (e) {
    console.warn("[chatRealtime] broadcast failed", e);
  }
}
```
Call this from endpoints with `ctx.waitUntil(notifyParticipants(...))` so delivery
never blocks or fails the response (same pattern as `lead.note` in
`functions/api/leads/[id].ts`).

### 4. `functions/api/chat/config.ts`

Hands the browser the Realtime URL + anon key, plus the caller's `tenantId` (the
presence channel is keyed on it, and the browser auth context does not carry it).
Any signed-in caller may read it. `tenantId` is `null` for admin sessions.
```ts
import type { Env, ApiData } from "../../lib/env";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = ctx.env.SUPABASE_URL ?? "";
  const anonKey = ctx.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    return Response.json({ error: "realtime_not_configured" }, { status: 503 });
  }
  // A legacy shared-owner session (owner, but no individual staff row) has no
  // chat identity, so it must not receive a tenantId or join the presence
  // channel. Refuse it here, matching resolveParticipant's needsIndividualAccount.
  if (ctx.data.isOwner && !ctx.data.staff && !ctx.data.admin) {
    return Response.json({ error: "needs_individual_account" }, { status: 403 });
  }
  // Staff carry tenant_id directly; admins have no tenant presence channel.
  const tenantId: string | null = ctx.data.staff?.tenant_id ?? null;
  return Response.json({ url, anonKey, tenantId });
};
```
Phase 04's `useChatConfig` reads `tenantId` from this response and feeds it to
`tenantPresenceTopic(tenantId)`. Skip the presence channel when `tenantId` is null.

### 4b. `functions/api/chat/presence/heartbeat.ts`

Phase 04's realtime hook POSTs here every ~60s so `chat_presence.last_seen` stays
fresh (the roster shows "last seen Xm ago" for offline members). Live online/offline
is driven by the Realtime presence channel, not this row; this is only the durable
"last seen" timestamp. Admins have no tenant roster, so their heartbeat is a no-op.

```ts
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const { participant } = await resolveParticipant(client, {
    isOwner: ctx.data.isOwner ?? false,
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  // Only tenant-scoped staff appear in a roster; admins (no tenantId) no-op.
  if (!participant || participant.kind !== "staff") return Response.json({ ok: true });
  const tenantId = participant.tenantId ?? (await resolveTenantId(client, ctx.data.tenant.slug));
  if (!tenantId) return Response.json({ ok: true });
  const { error } = await client.from("chat_presence").upsert(
    { tenant_id: tenantId, member_kind: "staff", member_id: participant.id, last_seen: new Date().toISOString() },
    { onConflict: "tenant_id,member_kind,member_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
```

### 5. `scripts/check-owner-identity.mjs`

A read-only check that every tenant has at least one `owner` `staff_accounts` row, so
no client is stuck on the identity-less shared-owner login. Mirror the env-loading
style of `scripts/db-migrate.mjs` (service-role key + REST). Print one line per tenant:
`OK <slug>` or `MISSING OWNER <slug>`. Do not write anything.

Run: `node scripts/check-owner-identity.mjs`. For any `MISSING OWNER`, the owner must
be added through the existing Team flow (or admin staff import) before chat works for
them.

### 6. Verify
- `GET /api/chat/config` returns `{ url, anonKey }` locally (set `SUPABASE_ANON_KEY`
  in `.dev.vars` / wrangler env first). 503 when unset.
- `node scripts/check-owner-identity.mjs` prints a clean report.

### 7. Commit
```bash
git add command-center/app/functions/lib/participants.ts \
  command-center/app/functions/lib/chatRealtime.ts \
  command-center/app/functions/api/chat/config.ts \
  command-center/app/functions/api/chat/presence/heartbeat.ts \
  command-center/app/functions/lib/env.ts \
  command-center/app/scripts/check-owner-identity.mjs
git commit -m "feat(comms): participant resolver, realtime notify, chat config + presence heartbeat"
```

## Definition of done
- `resolveParticipant` returns the right participant for staff/admin and flags
  identity-less shared-owner sessions.
- `notifyParticipants` posts to the Realtime broadcast API and never throws.
- `GET /api/chat/config` works; owner-identity check script runs clean.

## MANUAL ACTIONS - JAKE
1. Set `SUPABASE_ANON_KEY` in Cloudflare Pages env (and `.dev.vars` for local).
2. Confirm Supabase Realtime is enabled for the project (Dashboard -> Realtime).
3. If the owner-identity check reports any tenant missing an owner account, add it.
