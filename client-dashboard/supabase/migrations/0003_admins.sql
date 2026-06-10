-- Hauck Dashboard admin role.
-- Run AFTER 0001_init.sql.
-- Paste into Supabase dashboard -> SQL Editor -> New query -> Run.
-- Idempotent: safe to re-run.

-- =========================
-- admins
-- A user listed here can access /admin routes (read-only across all tenants).
-- Has no implicit tenant access; an admin who also needs a tenant view must
-- still be linked via tenant_users.
-- =========================
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Users can only see their own admin row (to check their own status from the client).
drop policy if exists admins_read_self on public.admins;
create policy admins_read_self on public.admins
  for select using (user_id = auth.uid());
