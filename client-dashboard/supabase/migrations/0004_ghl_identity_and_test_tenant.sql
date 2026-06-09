-- 0004: GHL-identity model (shared-password test app) + test-account tenant.
--
-- Plans 03 and 04 use a shared-password login plus a one-time "pick your GHL identity" step.
-- Under that model the reps have NO Supabase auth account: they are identified by their GHL
-- user id (the same value GHL puts in opportunity.assignedTo). The original schema (0001/0003)
-- keys tenant_users and admins on auth.users(id), which cannot hold a GHL-identified row.
--
-- This migration makes both tables workable in the GHL-identity model without breaking the
-- legacy auth-user rows (the willis-windows owner link in 0002 keeps working), and seeds the
-- test-account tenant that the Functions scope everything to (resolveTenantId(_, 'test-account')).
--
-- Run AFTER 0001, 0002, 0003. Idempotent: safe to re-run.
-- All Functions read/write these tables with the service-role client, which bypasses RLS, so the
-- existing auth.uid()-based RLS policies are left untouched (the frontend does not read these
-- tables directly under the current "route everything through /api/*" decision).

-- =========================
-- 1. tenant_users: allow GHL-identified rows (no auth user required)
-- =========================
alter table public.tenant_users
  add column if not exists ghl_user_id text,
  add column if not exists name        text,
  add column if not exists email       text;

-- Reps under the shared-password model have no auth.users row, so user_id is now optional.
alter table public.tenant_users
  alter column user_id drop not null;

-- The original primary key was (tenant_id, user_id). With user_id now nullable we drop it and
-- replace it with two partial unique indexes: one per identity space, each ignoring NULLs.
alter table public.tenant_users
  drop constraint if exists tenant_users_pkey;

create unique index if not exists tenant_users_tenant_ghl_uid
  on public.tenant_users (tenant_id, ghl_user_id)
  where ghl_user_id is not null;

create unique index if not exists tenant_users_tenant_user_uid
  on public.tenant_users (tenant_id, user_id)
  where user_id is not null;

-- =========================
-- 2. admins: allow matching by GHL user id (the identity the test app stores)
-- =========================
alter table public.admins
  drop constraint if exists admins_pkey;

alter table public.admins
  alter column user_id drop not null;

alter table public.admins
  add column if not exists ghl_user_id text;

create unique index if not exists admins_user_uid
  on public.admins (user_id) where user_id is not null;

create unique index if not exists admins_ghl_uid
  on public.admins (ghl_user_id) where ghl_user_id is not null;

-- =========================
-- 3. push_subscriptions: allow GHL-identified (auth-less) subscriptions
-- Same story as tenant_users: a shared-password device has no auth user. Subscriptions are
-- keyed by (tenant_id, endpoint) instead. The browser PushSubscription maps to the existing
-- endpoint / p256dh / auth columns (plan 06 must use those, not a single jsonb column).
-- =========================
alter table public.push_subscriptions
  alter column user_id drop not null;

alter table public.push_subscriptions
  add column if not exists ghl_user_id text;

create unique index if not exists push_subscriptions_tenant_endpoint
  on public.push_subscriptions (tenant_id, endpoint);

-- =========================
-- 4. Seed the test-account tenant
-- The test app still reads GHL creds from env (plan 03 keeps creds out of Supabase for now), so
-- ghl_location_id / ghl_token here are placeholders. This row exists only to scope tenant_users,
-- activity_log, and push_subscriptions for the test account.
-- =========================
insert into public.tenants (
  slug, name, niche,
  brand_color, brand_initials, app_name,
  won_label, value_label,
  ghl_location_id, ghl_token,
  monthly_spend
) values (
  'test-account', 'Test Account', 'home-services',
  '#1d6fb8', 'TA', 'Test Leads',
  'Won', 'Job Value',
  'env', 'env',
  0
)
on conflict (slug) do nothing;
