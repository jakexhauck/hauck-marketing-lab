# Team Comms Panel — Design Spec

Date: 2026-06-22
Status: Approved design, pending spec review
App: command-center (client-facing app + admin console)

## 1. Goal

Add a Discord-style team communications panel to the client-facing app. Each
client business (tenant) gets:

- A **member roster** with assignable cosmetic **roles** (colors) and live
  **online/offline presence**.
- **Internal messaging**: owner-created **channels**, ad-hoc **1:1 DMs** between
  members.
- A permission-gated **direct line to Hauck (the agency / Jake)**, surfaced in
  the admin console.

Definition of done: a logged-in member sees the panel on every app surface, sees
who is online, can message teammates in channels and DMs, and (if authorized)
can message Hauck. Jake sees and replies to those Hauck threads in the admin
console. Owners manage roles, channels, membership, who-can-contact-Hauck, and
can moderate messages.

## 2. Architecture decision (Approach A)

Messaging and roles live in new Postgres tables. All writes go through existing
`/api/*` Functions using the **service-role** client, exactly like every other
feature. Supabase **Realtime** is used only as a transport for live delivery and
presence.

Rejected Approach B (clients talk to Supabase directly under RLS keyed on
`auth.uid()`): staff and admins are deliberately NOT `auth.users` — the app uses
signed session tokens + service-role everywhere (`functions/lib/session.ts`).
B would introduce a second, parallel auth model just for chat. A keeps one auth
model and is both lower-risk and more consistent long-term.

### Realtime privacy (the one subtlety)

Because staff/admins are not `auth.users`, Realtime cannot gate private content
via RLS. So message **content never travels over Realtime**. Pattern is
**notify-then-fetch**:

1. `/api/*` inserts the message.
2. Server broadcasts a contentless ping ("new activity in channel X") to each
   recipient's personal Realtime topic (`person:<id>`).
3. The client refetches the message over `/api/*`, which enforces channel
   membership server-side.

Private DMs and Hauck threads therefore cannot leak to non-members. Presence
payloads (name + status only) are non-sensitive and ride Realtime Presence
directly. Upgrade path if true push payloads are ever wanted: mint a scoped,
Realtime-only Supabase JWT server-side — not needed for v1.

## 3. Identity model (small unification, no auth rewrite)

A **participant** is one of:

- a `staff_accounts` row (tenant-scoped; owners are `role='owner'` staff rows
  per migration 0010), or
- an `admin_accounts` row (Jake / agency operators; global).

A single resolver maps the current signed session to a participant
`{ kind: 'staff' | 'admin', id, tenantId? }`. Chat tables reference participants
by `(sender_kind, sender_id)`.

New column:

- `staff_accounts.can_contact_hauck boolean not null default false`
  Owners (`role='owner'`) default to `true` via seed/trigger; the owner can
  toggle it per employee.

Rollout note: any client still on the legacy shared owner-password login must be
given an `owner` `staff_accounts` row so the owner has an individual identity for
presence and DMs. Tracked as a rollout task, not a schema concern.

## 4. Roles (cosmetic only — never touch permissions)

App permissions remain 100% per-person via the existing `staff_permissions` /
entitlements system. Cosmetic roles are independent and purely organizational.

Tables:

- `chat_roles`: `id, tenant_id, name, color (hex), is_preset bool,
  sort_order int, created_at`. Each tenant seeded with presets
  **Owner / Manager / Rep / Employee** with default colors.
- `chat_member_roles`: `staff_account_id, chat_role_id` (join — **multiple roles
  per person**, Discord-style).

Display rules:

- A member's name color = the color of their highest `sort_order` role.
- Roster groups each member once, under their highest role.
- Owner can create custom roles (any name + color) and assign/unassign freely.

## 5. Channels, DMs, Hauck line

- `chat_channels`: `id, tenant_id, name, kind ('channel'|'dm'|'hauck'),
  created_by_kind, created_by_id, archived bool, created_at`.
- `chat_channel_members`: `channel_id, member_kind, member_id, last_read_at,
  added_at`. Per-person membership (matches "owner picks what each person can
  see").

Kinds:

- **channel**: owner creates named channels and selects members.
- **dm**: 1:1, created on demand between two members of the same tenant.
- **hauck**: private thread, one per authorized person. Members = that person +
  the admin pool. Created lazily when a `can_contact_hauck` person opens it.

## 6. Messages, edit/delete, moderation

- `chat_messages`: `id, channel_id, sender_kind, sender_id, body text,
  created_at, edited_at, deleted_at, deleted_by_kind, deleted_by_id`.
- Authors may **edit** and **soft-delete** their own messages (deleted shows
  "message deleted"; row retained).
- The tenant **owner may delete any message** in their tenant's channels
  (moderation), recorded via `deleted_by_*`.
- Read state: `chat_channel_members.last_read_at` drives unread counts/badges.

## 7. Attachments (in v1)

- `chat_attachments`: `id, message_id, file_name, mime_type, size_bytes,
  storage_path, width, height (nullable), created_at`.
- Stored in **Supabase Storage** (private bucket `chat-attachments`). Upload via
  `/api/*`: client requests a scoped upload, server validates type/size and
  returns a signed upload URL (or proxies the bytes); downloads via short-lived
  signed URLs issued by `/api/*` after a membership check.
- Limits (v1): images (png/jpg/webp/gif) + common docs (pdf), max ~25 MB each.
  Images get inline previews; other files render as a download chip.

## 8. Presence (online/offline)

- One Supabase Realtime **Presence** channel per tenant
  (`presence:tenant:<id>`), plus a global admin presence channel.
- Each open client tracks `{ personId, kind, name, status:'online' }`. Present =
  online; absent = offline.
- `last_seen` persisted (heartbeat on the presence channel, written through
  `/api/*` periodically and on disconnect) so the roster can show
  "last seen 5m ago" for offline members.
- v1 has no idle/away state.

## 9. Notifications

- Reuse existing `push_subscriptions` + web-push for background notifications
  when a recipient is offline and receives a DM / Hauck / channel mention.
- In-app unread badges derived from `last_read_at` vs latest message.

## 10. UI

### Client app — desktop
A collapsible **right rail** present across app surfaces (Discord-style):

- Top section: channels list + DMs list (with unread badges); a "Message Hauck"
  entry if the person is authorized.
- Roster section: members grouped by highest role, each name role-colored, with a
  presence dot and "last seen" on hover for offline members.
- Selecting a channel/DM/Hauck opens the conversation in a panel (message list,
  composer with attachment button, edit/delete affordances on own messages).

### Client app — mobile (PWA)
The rail collapses into a bottom-nav **"Team"** tab opening the same lists and
conversation views full-screen.

### Admin console (Jake)
A new **"Messages"** surface: clients → authorized people → their private Hauck
thread. Jake reads and replies inline; replies notify the recipient.

## 11. Onboarding integration

The existing "add employee" flow gains, without changing the permission model:

- assign one or more cosmetic chat roles (pick presets and/or create new + color),
- existing per-surface permissions (unchanged),
- toggle "can message Hauck" (`can_contact_hauck`),
- pick channel memberships.

## 12. Components / boundaries

- **`functions/lib/participants.ts`** — resolve session → participant; membership
  checks. Used by every chat endpoint.
- **`functions/api/chat/*`** — roles CRUD, channels CRUD, membership, messages
  (list/send/edit/delete), attachments (upload/sign), presence heartbeat,
  contact-hauck gating, admin Hauck inbox.
- **Realtime layer** — presence join/track + per-person notify topic; a thin
  client hook `useChatRealtime`.
- **Client UI** — `components/comms/*` (RightRail, Roster, ChannelList,
  Conversation, Composer, RoleBadge, PresenceDot) + a mobile Team route.
- **Admin UI** — `routes/admin/Messages.tsx` + components.

Each unit has one purpose, communicates via `/api/*` JSON + typed client funcs,
and is testable in isolation.

## 13. Build order (parallelizable once schema is frozen)

1. **Schema + seeds** (migrations: roles, member_roles, channels, channel_members,
   messages, attachments, presence/last_seen, `can_contact_hauck`).
2. **`/api/*` endpoints** + `participants.ts` resolver + membership guards.
3. **Realtime** (presence + notify-then-fetch hook).
4. **Client right rail UI** (roster, presence, channels, DMs, conversation).
5. **Hauck line** + admin Messages console.
6. **Onboarding additions** (roles, can_contact_hauck, channel membership).
7. **Attachments** (storage bucket, upload/sign endpoints, previews).
8. **Push notifications + unread badges.**

After step 1 freezes the schema, steps 2 (API), 4 (UI scaffold), and 5 (admin
surface) can run as parallel subagent tracks, integrated behind the typed client
layer.

## 14. Testing

- API: membership-enforcement tests (non-members cannot read/send/fetch);
  edit/delete authorization; owner moderation; contact-hauck gating.
- Realtime privacy: assert content is never broadcast; only per-person pings.
- Presence: join/leave updates roster; last_seen persists.
- Attachments: type/size validation; signed-URL access requires membership.
- UI: roster grouping by highest role; unread badge math; mobile Team tab.

## 15. Out of scope (v1)

- Threaded replies, reactions, typing indicators, @mentions autocomplete,
  voice/video, message search, idle/away presence, cross-tenant chat.
  All are clean follow-ons on this schema.
