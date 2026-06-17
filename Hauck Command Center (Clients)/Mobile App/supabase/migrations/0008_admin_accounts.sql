-- 0008: super-admin accounts (the "control tower").
--
-- A small set of agency operators (Jake) who sign in with their OWN email +
-- password and get a session that can read and manage EVERY tenant, above the
-- per-client deployment pin. This is distinct from:
--   - the per-tenant owner (shared-password login, full access to ONE client)
--   - per-tenant staff      (0007, scoped to ONE client)
--
-- The pre-0008 `admins` table (0003/0004) keyed admins on a client-supplied GHL
-- user id, which the code itself flags as "not safe for destructive ops". This
-- migration replaces that with credentialed accounts whose identity is bound
-- into the SIGNED session token (see functions/lib/session.ts), never asserted
-- from a header. The old `admins` table is left untouched (still gates the
-- read-only team-sync op); new cross-tenant power flows through here.
--
-- password_hash is PBKDF2 (functions/lib/password.ts), never plaintext.
-- Run AFTER 0001..0007. Idempotent: safe to re-run.
-- All Functions read/write these tables with the service-role client (RLS on,
-- no policies => only the service role reaches them).

-- =========================
-- 1. admin_accounts: the agency operators.
-- =========================
create table if not exists public.admin_accounts (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  name          text not null,
  status        text not null default 'active' check (status in ('active','disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Email is the login handle, globally unique (lower-cased by the app on insert).
create unique index if not exists admin_accounts_email
  on public.admin_accounts (lower(email));

alter table public.admin_accounts enable row level security;
-- No policies: the table is reachable only via the service-role client in
-- Functions. The browser never queries it directly.

-- =========================
-- 2. admin_audit_log: every cross-tenant admin write leaves a footprint.
-- The master key is powerful, so who-did-what-when is recorded, not optional.
-- target_tenant_id is null for account-wide actions (e.g. creating a client).
-- =========================
create table if not exists public.admin_audit_log (
  id               bigserial primary key,
  admin_id         uuid not null references public.admin_accounts(id) on delete cascade,
  action           text not null,
  target_tenant_id uuid references public.tenants(id) on delete set null,
  payload          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_time_idx
  on public.admin_audit_log (admin_id, created_at desc);

create index if not exists admin_audit_log_tenant_time_idx
  on public.admin_audit_log (target_tenant_id, created_at desc);

alter table public.admin_audit_log enable row level security;
-- No policies: service-role only, same as admin_accounts.

-- =========================
-- 3. Seed the first admin account.
-- Done OUT of this migration on purpose: the password hash is a credential and
-- does not belong in version control. See docs/build-plans/MANUAL-ACTIONS or
-- ask the build assistant for the one-time INSERT with a freshly generated
-- PBKDF2 hash to paste into the Supabase SQL editor.
-- =========================
