# Team Comms Panel - Build Plan Index

> **For agentic workers:** Use `superpowers:subagent-driven-development` to execute
> this plan task-by-task, one phase doc at a time, reviewing between tasks. Address
> Jake as **"Sir"**. **No em dashes anywhere** (chat, code comments, UI text, copy).

**Goal:** Add a Discord-style team comms panel to the client-facing Command Center:
a member roster with assignable cosmetic roles and live online/offline presence,
internal channels + 1:1 DMs, and a permission-gated direct line to Hauck (Jake)
surfaced in the admin console.

**Design spec:** `docs/superpowers/specs/2026-06-22-team-comms-panel-design.md` (approved).

**Architecture (Approach A):** New Postgres tables. All writes go through Cloudflare
Pages Functions (`functions/api/chat/*`) using the service-role client, exactly like
every other feature. Supabase Realtime is a transport only: browser clients subscribe
for live delivery + presence; message **content never travels over Realtime**
(notify-then-fetch). Chat keys on existing identities (`staff_accounts`,
`admin_accounts`), so no second auth model is introduced.

**Tech stack:** React 19 + react-router 7, TanStack Query v5, Tailwind v4, Cloudflare
Pages Functions, Supabase (Postgres + Realtime + Storage), `@supabase/supabase-js`
2.105.4, Vitest (added in Phase 1 for unit-testable logic).

---

## Global constraints (every task inherits these)

- **No em dashes** in any output, including code comments and UI strings.
- **Runtime:** Cloudflare Pages Functions. Handlers export `onRequestGet` /
  `onRequestPost` / `onRequestPatch` / `onRequestDelete`, typed
  `PagesFunction<Env, "param", ApiData>`. File-based routing under `functions/api/`.
- **All DB access server-side** via `getServiceClient(ctx.env)` from
  `functions/lib/supabase.ts` (returns `null` when unconfigured -> respond `503`).
  Never query Supabase from the browser except the Realtime socket (anon key).
- **Auth contract** (from `functions/api/_middleware.ts`, populated on `ctx.data`):
  `ctx.data.isOwner: boolean`, `ctx.data.staff: StaffRecord | null`,
  `ctx.data.admin: AdminRecord | null` (admin routes only),
  `ctx.data.tenant.slug`. Resolve tenant id with
  `resolveTenantId(client, ctx.data.tenant.slug)`.
- **Client API calls** go through `api<T>(path, init)` from `src/lib/api.ts`
  (`credentials: "include"`, throws `ApiError`). Never call `fetch` directly.
- **Migrations** are applied with `npm run db:migrate` (Management API + ledger).
  Never use the Supabase SQL editor. Files: `supabase/migrations/00NN_*.sql`,
  idempotent (`create ... if not exists`), RLS enabled, no policies (service-role only).
- **Styling:** Tailwind v4 + CSS custom properties from `src/index.css`
  (`--brand-primary: #4dbb83`, `--surface`, `--text`, `--border`, etc.). Fonts:
  `--font-display` (Poppins) for display, `--font-body` (Inter) for body. Reuse
  `src/components/Avatar.tsx`, `src/components/ui/Badge.tsx`.

---

## Frozen contract (do not rename these without updating this file)

### Tables (migration `0016_team_comms.sql`, see Phase 01)

| Table | Purpose |
|---|---|
| `chat_roles` | cosmetic roles per tenant (`name, color, is_preset, sort_order`) |
| `chat_member_roles` | join: which roles a staff member has (multiple allowed) |
| `chat_channels` | `kind ('channel'\|'dm'\|'hauck')`, tenant-scoped |
| `chat_channel_members` | per-person membership + `last_read_at` |
| `chat_messages` | `body`, soft-delete + edit columns, `tenant_id` denormalized |
| `chat_attachments` | file metadata, bytes in Storage bucket `chat-attachments` |
| `chat_presence` | `last_seen` per (tenant, member) for "last seen" labels |

Column add: `staff_accounts.can_contact_hauck boolean not null default false`.
Column add: `push_subscriptions.participant_kind text`, `push_subscriptions.participant_id uuid`.

A **participant** is `{ kind: 'staff' | 'admin', id, tenantId, name }`. `member_kind`
/ `sender_kind` / `created_by_kind` / `deleted_by_kind` are always `'staff'` or
`'admin'`. `member_id` etc. is the matching `staff_accounts.id` or `admin_accounts.id`.

### Backend lib signatures (Phase 02)

`functions/lib/participants.ts`:
```ts
export type Participant = { kind: "staff" | "admin"; id: string; tenantId: string | null; name: string };
// Resolve the caller (set by _middleware) into a chat participant.
// needsIndividualAccount=true for a legacy shared-owner session with no staff row.
export async function resolveParticipant(
  client: SupabaseClient, ctx: { isOwner: boolean; staff: StaffRecord | null; admin: AdminRecord | null; tenantSlug: string },
): Promise<{ participant: Participant | null; needsIndividualAccount: boolean }>;
export async function isChannelMember(client: SupabaseClient, channelId: string, p: Participant): Promise<boolean>;
```

`functions/lib/chatRealtime.ts`:
```ts
export type ChatRealtimeEvent = { kind: "message" | "read" | "channel" | "presence_dirty"; channelId?: string };
// Fire-and-forget broadcast (notify only, no content) to each recipient's person topic.
export async function notifyParticipants(env: Env, recipients: { kind: string; id: string }[], event: ChatRealtimeEvent): Promise<void>;
// Topic a browser subscribes to for its own notifications.
export function personTopic(kind: string, id: string): string; // `chat:person:${kind}:${id}`
export function tenantPresenceTopic(tenantId: string): string;  // `chat:presence:${tenantId}`
```

### Endpoints (Phase 03, 07, 08)

```
GET    /api/chat/config                       -> { url, anonKey, tenantId }  (Realtime connect info)
GET    /api/chat/roster                       -> { members: ChatMember[] }
GET    /api/chat/roles                         -> { roles: ChatRole[] }
POST   /api/chat/roles                         (owner) create { name, color }
PATCH  /api/chat/roles/[roleId]                (owner) { name?, color?, sortOrder? }
DELETE /api/chat/roles/[roleId]                (owner) (preset roles cannot be deleted)
GET    /api/chat/channels                      -> { channels: ChatChannel[] } (caller's only)
POST   /api/chat/channels                      (owner) { name, memberIds: string[] }
PATCH  /api/chat/channels/[channelId]          (owner) { name?, archived?, memberIds? }
POST   /api/chat/dm                            { memberId } -> { channel } (get-or-create)
GET    /api/chat/hauck                         -> { channel } (get-or-create; owner or can_contact_hauck)
GET    /api/chat/channels/[channelId]/messages?before=ISO -> { messages: ChatMessageDTO[] }
POST   /api/chat/channels/[channelId]/messages { body, attachmentIds?: string[] } -> { message }
POST   /api/chat/channels/[channelId]/read     -> { ok: true }
PATCH  /api/chat/messages/[messageId]          { body } (author only)
DELETE /api/chat/messages/[messageId]          (author, or tenant owner moderation)
POST   /api/chat/attachments                   { fileName, mimeType, sizeBytes } -> { attachmentId, uploadUrl, path }
GET    /api/chat/attachments/[attachmentId]    -> { url } (signed download; membership enforced)
POST   /api/chat/presence/heartbeat            -> { ok: true } (updates chat_presence.last_seen)
GET    /api/admin/messages                     (admin) -> { threads: AdminHauckThread[] }
GET    /api/admin/messages/[channelId]/messages (admin) -> { messages: ChatMessageDTO[] }
POST   /api/admin/messages/[channelId]/send    (admin) { body } -> { message }
```

Owner-only endpoints check `ctx.data.isOwner` in-handler (chat paths are otherwise
open to any signed-in staff; the middleware adds no rule for `/api/chat/*`).

### Client types (`src/lib/api.ts`)

```ts
export interface ChatRole { id: string; name: string; color: string; isPreset: boolean; sortOrder: number; }
export interface ChatMember { id: string; name: string; roles: ChatRole[]; online: boolean; lastSeen: string | null; canContactHauck: boolean; }
export interface ChatChannel { id: string; kind: "channel" | "dm" | "hauck"; name: string; memberIds: string[]; unread: number; lastMessageAt: string | null; }
export interface ChatAttachment { id: string; fileName: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; }
export interface ChatMessageDTO { id: string; channelId: string; senderKind: "staff" | "admin"; senderId: string; senderName: string; body: string; createdAt: string; editedAt: string | null; deletedAt: string | null; attachments: ChatAttachment[]; }
export interface AdminHauckThread { channelId: string; tenantId: string; tenantName: string; personName: string; unread: number; lastMessageAt: string | null; }
```

### Query keys (`src/hooks/useChat.ts`)

```
["chat","config"]  ["chat","roster"]  ["chat","roles"]  ["chat","channels"]
["chat","channel", channelId, "messages"]
["admin","messages"]  ["admin","message", channelId]
```

### Client modules / components

```
src/lib/chatClient.ts            browser supabase client (anon key) + topic helpers
src/hooks/useChat.ts             all chat queries + mutations
src/hooks/useChatRealtime.ts     presence + notify subscription -> query invalidation
src/context/ChatContext.tsx      current participant + presence map; <ChatProvider>
src/components/comms/RightRail.tsx        desktop docked rail (channels + roster)
src/components/comms/ChannelList.tsx
src/components/comms/Roster.tsx
src/components/comms/Conversation.tsx     message list + composer
src/components/comms/Composer.tsx         text + attachment upload
src/components/comms/RoleBadge.tsx
src/components/comms/PresenceDot.tsx
src/components/comms/RoleManager.tsx      owner: create/edit/delete roles
src/routes/Comms.tsx              mobile full-screen surface (route /comms, nav "Chat")
src/routes/admin/AdminMessages.tsx        admin Hauck inbox
```

Route additions: client `/comms` (under `ProtectedRoute`), admin `/admin/messages`
(under `AdminRoute`). New `NAV` item `{ to: "/comms", label: "Chat", shortLabel:
"Chat", icon: MessagesSquare, bottomNav: true }` in `src/lib/nav.ts` (label "Chat",
not "Team", to avoid colliding with the existing owner-only `/team` staff page). New
`ADMIN_NAV` item `{ to: "/admin/messages", label: "Messages", icon: MessageSquare }`
in `src/routes/admin/AdminLayout.tsx`.

---

## Testing strategy

Per the project rule "TDD where testable": the repo has **no test runner today**, so
Phase 01 adds **Vitest**. Use TDD for pure logic only:

- `highestRole()` color/grouping resolution, unread math, `last_seen` -> online
  threshold, attachment type/size validation, grant/role normalization,
  presence-map reducer.

Everything I/O-bound (Cloudflare handlers, Realtime, Storage, UI) is verified by
**running it**: `npm run dev`, exercise the flow, and Playwright screenshots of the
real app (M9). No "should work" claims; show evidence (Spine: Verify).

---

## Phases (build order)

1. **`01-schema-and-storage.md`** - migration `0016`, Storage bucket, seeds, Vitest setup.
2. **`02-backend-libs-and-realtime.md`** - `participants.ts`, `chatRealtime.ts`,
   browser client, `GET /api/chat/config`, `POST /api/chat/presence/heartbeat`.
3. **`03-chat-api-endpoints.md`** - roster, roles, channels, dm, messages, read,
   message edit/delete endpoints.
4. **`04-client-data-and-realtime-hooks.md`** - types, `useChat.ts`, `chatClient.ts`,
   `useChatRealtime.ts`, `ChatContext`.
5. **`05-right-rail-ui.md`** - RightRail, ChannelList, Roster, Conversation, Composer,
   PresenceDot, RoleBadge; mount in `Shell.tsx`; mobile `/comms` route + bottom nav.
6. **`06-roles-and-onboarding.md`** - RoleManager; extend `EmployeeForm` (assign roles,
   `can_contact_hauck` toggle, channel membership).
7. **`07-hauck-line-and-admin-console.md`** - `GET /api/chat/hauck`, admin endpoints,
   `AdminMessages.tsx`, admin nav + route.
8. **`08-attachments-and-push.md`** - attachment upload/download endpoints + composer
   wiring + previews; push fan-out for chat (extend `push_subscriptions`).

After Phase 01 freezes the schema, Phases 03 (API), 05 (UI scaffold), and 07 (admin)
can run as parallel subagent tracks behind the typed client layer.

## Rollout / manual actions (JAKE)

1. After Phase 01: run `npm run db:migrate` (needs `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_URL`). Confirm `chat-attachments` bucket exists in Supabase Storage.
2. Set `SUPABASE_ANON_KEY` in Cloudflare env (browser Realtime). Confirm Realtime is
   enabled for the project. During Phase 02/03 smoke-testing, confirm the server-side
   broadcast endpoint (`${SUPABASE_URL}/realtime/v1/api/broadcast`) returns 2xx; it is
   fire-and-forget (failures only `console.warn`), so verify it once explicitly.
3. **Identity backfill:** every chat participant must log in as an individual account.
   Confirm Willis's owner has an `owner` `staff_accounts` row (not the legacy shared
   password). Phase 02 includes a check script.
4. Phase 08 reuses existing VAPID keys; no new push secret needed.
