-- 0013: internal portal "Assets" — Google Drive as the file backend.
--
-- The internal hub (internal.hauckmarketing.com) browses the agency's client
-- files, which already live in Google Drive. Drive stays the storage; these
-- tables are only the plumbing the portal needs on top:
--
--   1. drive_connection  — the ONE agency Google account's OAuth tokens, so the
--                          portal can call Drive on its behalf. Single row.
--   2. client_folders    — maps a client to its Drive folder (the browsable root).
--   3. folder_access     — which admin may see which client folder (per-person).
--   4. drive_full_access — admins who see EVERY client folder (the owner, Jake).
--
-- Access model: an admin in drive_full_access sees all client_folders. Any other
-- admin sees only the client_folders linked to them in folder_access. Enforced
-- server-side in the Functions before any Drive call (functions/lib/driveAccess.ts).
--
-- Shares the Command Center Supabase project (the intranet reuses it). Run AFTER
-- 0001..0012. Idempotent: safe to re-run. Reached only via the service-role
-- client in Functions (RLS on, no policies), same as admin_accounts.

-- =========================
-- 1. drive_connection: the agency Google account's tokens.
-- Single logical row (id = true). The refresh_token is long-lived and minted
-- once at connect time; the access_token is a short-lived cache we refresh as
-- needed. connected_email is just for display ("Connected as …").
-- =========================
create table if not exists public.drive_connection (
  id                       boolean primary key default true,
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  connected_email          text,
  scope                    text,
  connected_by             uuid references public.admin_accounts(id) on delete set null,
  updated_at               timestamptz not null default now(),
  -- Enforce a single row: id can only ever be true.
  constraint drive_connection_singleton check (id = true)
);

alter table public.drive_connection enable row level security;
-- No policies: service-role only. Holds a credential, never reaches the browser.

-- =========================
-- 2. client_folders: a client (or any agency area) mapped to a Drive folder.
-- folder_id is the bare Drive folder id (extracted from the share URL). tenant_id
-- links to a real client when there is one; null = an agency-wide area (e.g.
-- "Brand Kit", "Templates"). This is the browsable ROOT — subfolders are walked
-- live from Drive, not stored here.
-- =========================
create table if not exists public.client_folders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  name          text not null,
  folder_id     text not null,
  web_view_link text,
  sort          integer not null default 0,
  created_by    uuid references public.admin_accounts(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- One mapping per Drive folder.
create unique index if not exists client_folders_folder_id
  on public.client_folders (folder_id);

create index if not exists client_folders_sort_idx
  on public.client_folders (sort, name);

alter table public.client_folders enable row level security;
-- No policies: service-role only.

-- =========================
-- 3. folder_access: which admin may browse which client folder.
-- Presence of a row = granted. Absence + not in drive_full_access = denied.
-- =========================
create table if not exists public.folder_access (
  admin_id         uuid not null references public.admin_accounts(id) on delete cascade,
  client_folder_id uuid not null references public.client_folders(id) on delete cascade,
  granted_by       uuid references public.admin_accounts(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (admin_id, client_folder_id)
);

create index if not exists folder_access_admin_idx
  on public.folder_access (admin_id);

alter table public.folder_access enable row level security;
-- No policies: service-role only.

-- =========================
-- 4. drive_full_access: admins who see every client folder (the agency owner).
-- A row here overrides folder_access — that admin sees all client_folders.
-- =========================
create table if not exists public.drive_full_access (
  admin_id   uuid primary key references public.admin_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.drive_full_access enable row level security;
-- No policies: service-role only.

-- =========================
-- 5. Seed full access for existing admins (one-operator agency today: Jake).
-- Until staff are scoped per-client, every current admin sees everything. New
-- admins are NOT auto-granted — they start with no access until assigned.
-- =========================
insert into public.drive_full_access (admin_id)
  select id from public.admin_accounts
  on conflict (admin_id) do nothing;
