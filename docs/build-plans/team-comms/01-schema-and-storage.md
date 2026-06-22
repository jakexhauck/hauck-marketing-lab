# Phase 01 - Schema, Storage, and Test Setup

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Land the data model everything else depends on: the `0016_team_comms.sql` migration,
the `chat-attachments` Storage bucket, per-tenant preset role seeds, and a Vitest
setup so later phases can TDD pure logic.

## Files
- Create: `command-center/app/supabase/migrations/0016_team_comms.sql`
- Modify: `command-center/app/package.json` (add `test` script + devDeps)
- Create: `command-center/app/vitest.config.ts`
- Create: `command-center/app/src/lib/chatLogic.ts` (pure helpers, TDD here)
- Create: `command-center/app/src/lib/chatLogic.test.ts`

## Work

### 1. Write the migration

Create `0016_team_comms.sql`. Mirror the header/idempotency style of `0013-0015`.

```sql
-- 0016: team comms panel - roles, channels, DMs, messages, attachments, presence.
--
-- A Discord-style internal comms layer for each client business (tenant):
--   chat_roles / chat_member_roles  - cosmetic roles (name + color), many per person.
--                                     Independent of staff_permissions; purely visual.
--   chat_channels / chat_channel_members - owner-made channels, 1:1 DMs, and the
--                                     private 'hauck' line. Membership is per-person.
--   chat_messages / chat_attachments - text + files (bytes in Storage bucket
--                                     'chat-attachments'). Edit + soft-delete.
--   chat_presence                    - last_seen per person, for "last seen" labels.
--
-- Identity: a participant is a staff_accounts row (owner included, role 'owner') or
-- an admin_accounts row (Jake). member_kind/sender_kind in ('staff','admin').
--
-- Run AFTER 0001..0015. Idempotent: safe to re-run. Reached only via the
-- service-role client in Functions (RLS on, no policies), same as admin_accounts.

-- can_contact_hauck: per-person gate for the Hauck line. Owners default true.
alter table public.staff_accounts
  add column if not exists can_contact_hauck boolean not null default false;
update public.staff_accounts set can_contact_hauck = true
  where role = 'owner' and can_contact_hauck = false;

-- push targeting by individual participant (Phase 08).
alter table public.push_subscriptions
  add column if not exists participant_kind text,
  add column if not exists participant_id uuid;

-- =========================
-- chat_roles: cosmetic roles per tenant.
-- =========================
create table if not exists public.chat_roles (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  color      text not null,
  is_preset  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chat_roles_tenant_idx on public.chat_roles (tenant_id);
create unique index if not exists chat_roles_tenant_name
  on public.chat_roles (tenant_id, lower(name));
alter table public.chat_roles enable row level security;

-- =========================
-- chat_member_roles: which roles a staff member has (multiple allowed).
-- =========================
create table if not exists public.chat_member_roles (
  staff_account_id uuid not null references public.staff_accounts(id) on delete cascade,
  chat_role_id     uuid not null references public.chat_roles(id) on delete cascade,
  primary key (staff_account_id, chat_role_id)
);
alter table public.chat_member_roles enable row level security;

-- =========================
-- chat_channels: channels, DMs, and the hauck line.
-- =========================
create table if not exists public.chat_channels (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null default '',
  kind            text not null check (kind in ('channel','dm','hauck')),
  created_by_kind text,
  created_by_id   uuid,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists chat_channels_tenant_idx on public.chat_channels (tenant_id);
alter table public.chat_channels enable row level security;

-- =========================
-- chat_channel_members: per-person membership + read cursor.
-- member_kind in ('staff','admin'); member_id is the staff/admin account id.
-- =========================
create table if not exists public.chat_channel_members (
  channel_id   uuid not null references public.chat_channels(id) on delete cascade,
  member_kind  text not null check (member_kind in ('staff','admin')),
  member_id    uuid not null,
  last_read_at timestamptz,
  added_at     timestamptz not null default now(),
  primary key (channel_id, member_kind, member_id)
);
create index if not exists chat_channel_members_member_idx
  on public.chat_channel_members (member_kind, member_id);
alter table public.chat_channel_members enable row level security;

-- =========================
-- chat_messages: text body, edit + soft-delete. tenant_id denormalized for fan-out.
-- =========================
create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.chat_channels(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  sender_kind     text not null check (sender_kind in ('staff','admin')),
  sender_id       uuid not null,
  body            text not null default '',
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by_kind text,
  deleted_by_id   uuid
);
create index if not exists chat_messages_channel_time_idx
  on public.chat_messages (channel_id, created_at desc);
alter table public.chat_messages enable row level security;

-- =========================
-- chat_attachments: file metadata; bytes live in Storage bucket 'chat-attachments'.
-- message_id is null until the message is sent (upload-first flow, Phase 08).
-- =========================
create table if not exists public.chat_attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid references public.chat_messages(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  uploader_kind text not null,
  uploader_id   uuid not null,
  file_name   text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  storage_path text not null,
  width       integer,
  height      integer,
  created_at  timestamptz not null default now()
);
create index if not exists chat_attachments_message_idx
  on public.chat_attachments (message_id);
alter table public.chat_attachments enable row level security;

-- =========================
-- chat_presence: last_seen per person, for "last seen Xm ago" on offline members.
-- =========================
create table if not exists public.chat_presence (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  member_kind text not null,
  member_id   uuid not null,
  last_seen   timestamptz not null default now(),
  primary key (tenant_id, member_kind, member_id)
);
alter table public.chat_presence enable row level security;

-- =========================
-- Storage bucket for attachments (private; access via signed URLs from Functions).
-- =========================
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- =========================
-- Seed the four preset cosmetic roles for every existing tenant.
-- Higher sort_order wins for name color + roster grouping. is_preset => undeletable.
-- =========================
insert into public.chat_roles (tenant_id, name, color, is_preset, sort_order)
select t.id, r.name, r.color, true, r.sort_order
from public.tenants t
cross join (values
  ('Owner',    '#4dbb83', 40),
  ('Manager',  '#6366f1', 30),
  ('Rep',      '#0ea5e9', 20),
  ('Employee', '#94a3b8', 10)
) as r(name, color, sort_order)
on conflict (tenant_id, lower(name)) do nothing;
```

### 2. Apply and verify

Run (Jake, or the executor if creds are present):
```bash
cd command-center/app && npm run db:migrate
```
Expected: ledger reports `0016_team_comms` applied. Verify in Supabase that the
seven tables exist and `chat-attachments` is in Storage. If `storage.buckets` insert
is rejected by the Management API, create the bucket manually (Manual action).

### 3. Add Vitest

In `command-center/app/package.json` add to `devDependencies` and `scripts`:
```jsonc
"scripts": { /* ...existing... */ "test": "vitest run", "test:watch": "vitest" }
// devDependencies: "vitest": "^2.1.0"
```
Install: `cd command-center/app && pnpm add -D vitest`.

Create `command-center/app/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

### 4. TDD the pure logic (`src/lib/chatLogic.ts`)

Write the test first (`chatLogic.test.ts`), watch it fail, then implement.

```ts
import { describe, it, expect } from "vitest";
import { highestRole, isOnline, validateAttachment, unreadCount } from "./chatLogic";
import type { ChatRole } from "./api";

const role = (name: string, sort: number, color = "#fff"): ChatRole =>
  ({ id: name, name, color, isPreset: true, sortOrder: sort });

describe("highestRole", () => {
  it("returns the role with the greatest sortOrder", () => {
    expect(highestRole([role("Rep", 20), role("Owner", 40)])?.name).toBe("Owner");
  });
  it("returns null for no roles", () => {
    expect(highestRole([])).toBeNull();
  });
});

describe("isOnline", () => {
  it("true when a presence id is in the live set", () => {
    expect(isOnline("staff:1", new Set(["staff:1"]))).toBe(true);
  });
  it("false otherwise", () => {
    expect(isOnline("staff:2", new Set(["staff:1"]))).toBe(false);
  });
});

describe("validateAttachment", () => {
  it("accepts a png under the limit", () => {
    expect(validateAttachment("image/png", 1_000_000).ok).toBe(true);
  });
  it("rejects an unsupported type", () => {
    expect(validateAttachment("application/x-msdownload", 10).ok).toBe(false);
  });
  it("rejects oversized files", () => {
    expect(validateAttachment("image/png", 30_000_000).ok).toBe(false);
  });
});

describe("unreadCount", () => {
  it("counts messages after last_read_at", () => {
    const msgs = [{ createdAt: "2026-06-22T10:00:00Z" }, { createdAt: "2026-06-22T11:00:00Z" }];
    expect(unreadCount(msgs, "2026-06-22T10:30:00Z")).toBe(1);
  });
  it("counts all when never read", () => {
    const msgs = [{ createdAt: "2026-06-22T10:00:00Z" }];
    expect(unreadCount(msgs, null)).toBe(1);
  });
});
```

Implement `chatLogic.ts`:
```ts
import type { ChatRole } from "./api";

const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
const ATTACH_ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
]);

export function highestRole(roles: ChatRole[]): ChatRole | null {
  if (roles.length === 0) return null;
  return roles.reduce((a, b) => (b.sortOrder > a.sortOrder ? b : a));
}

export function isOnline(presenceId: string, live: Set<string>): boolean {
  return live.has(presenceId);
}

export function validateAttachment(
  mimeType: string, sizeBytes: number,
): { ok: boolean; reason?: string } {
  if (!ATTACH_ALLOWED.has(mimeType)) return { ok: false, reason: "unsupported_type" };
  if (sizeBytes > ATTACH_MAX_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true };
}

export function unreadCount(
  msgs: { createdAt: string }[], lastReadAt: string | null,
): number {
  if (!lastReadAt) return msgs.length;
  const cutoff = Date.parse(lastReadAt);
  return msgs.filter((m) => Date.parse(m.createdAt) > cutoff).length;
}
```

Run `npm run test` -> all pass. The same `ATTACH_ALLOWED` / `ATTACH_MAX_BYTES` rule
is re-enforced server-side in Phase 08; keep the values identical.

### 5. Commit
```bash
git add command-center/app/supabase/migrations/0016_team_comms.sql \
  command-center/app/package.json command-center/app/vitest.config.ts \
  command-center/app/src/lib/chatLogic.ts command-center/app/src/lib/chatLogic.test.ts
git commit -m "feat(comms): team comms schema, storage bucket, vitest + chat logic"
```

## Definition of done
- `0016_team_comms` applied; seven tables + `chat-attachments` bucket exist.
- Every tenant has the four preset roles; owners have `can_contact_hauck = true`.
- `npm run test` passes (chatLogic).

## MANUAL ACTIONS - JAKE
1. Run `npm run db:migrate` (or confirm CI ran it). If the `storage.buckets` insert
   was rejected, create a private bucket named `chat-attachments` in Supabase Storage.
