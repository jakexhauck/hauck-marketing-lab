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
