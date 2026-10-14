-- 0007: native staff accounts with per-surface permissions.
--
-- Lets a business owner add their own employees (each with an email + password)
-- and grant them view/edit access per CRM surface. The three-layer model:
--
--   Layer 1  CRM capability registry   (code-defined; see functions/lib/permissions.ts)
--   Layer 2  tenant_entitlements        (per business: which capabilities are on)
--   Layer 3  staff_permissions          (per staff member: a subset, view/edit)
--
-- A grant is only valid if the tenant has the capability (Layer 2), and a tenant
-- can only have what the registry offers (Layer 1). The owner (shared-password
-- login, no staff row) always has everything enabled.
--
-- Run AFTER 0001..0006. Idempotent: safe to re-run.
-- All Functions read/write these tables with the service-role client (bypasses
-- RLS), matching the existing "route everything through /api/*" decision.

-- =========================
-- 1. tenant_entitlements: which capabilities each business has turned on.
-- capability is a free-text key matched against the code-defined registry.
-- =========================
create table if not exists public.tenant_entitlements (
  tenant_id  uuid    not null references public.tenants(id) on delete cascade,
  capability text    not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, capability)
);

alter table public.tenant_entitlements enable row level security;

-- =========================
-- 2. staff_accounts: the employees an owner adds. Mapped to a GHL user
-- (ghl_user_id) when provisioning succeeds; nullable so the account still works
-- if GHL user creation is unavailable (see functions/lib/staff.ts).
-- password_hash is PBKDF2 (functions/lib/password.ts), never plaintext.
-- =========================
create table if not exists public.staff_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  ghl_user_id   text,
  email         text not null,
  password_hash text not null,
  name          text not null,
  role          text not null default 'rep' check (role in ('owner','manager','rep')),
  status        text not null default 'active' check (status in ('active','disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Email is the staff login handle, unique within a business. Lower-cased by the
-- app before insert so lookups are case-insensitive.
create unique index if not exists staff_accounts_tenant_email
  on public.staff_accounts (tenant_id, lower(email));

create index if not exists staff_accounts_tenant_idx
  on public.staff_accounts (tenant_id);

alter table public.staff_accounts enable row level security;

-- =========================
-- 3. staff_permissions: per-staff view/edit per capability. can_edit implies
-- can_view (enforced in app + a CHECK here as a backstop). A row only grants
-- access if the tenant still has the capability enabled (re-checked at request
-- time in the middleware), so a later entitlement change is honoured even if a
-- stale grant row lingers.
-- =========================
create table if not exists public.staff_permissions (
  staff_account_id uuid    not null references public.staff_accounts(id) on delete cascade,
  capability       text    not null,
  can_view         boolean not null default false,
  can_edit         boolean not null default false,
  primary key (staff_account_id, capability),
  constraint staff_permissions_edit_implies_view check (not can_edit or can_view)
);

alter table public.staff_permissions enable row level security;

-- =========================
-- 4. Seed entitlements for existing tenants with the surfaces the CRM ships
-- today. New capabilities (booking, reviews, automations, ...) are added per
-- tenant as those features ship. unnest keeps this one statement.
-- =========================
insert into public.tenant_entitlements (tenant_id, capability, enabled)
select t.id, c.capability, true
from public.tenants t
cross join (
  select unnest(array[
    'overview','paid_ads','pipeline','inbox',
    'contacts','calendar','billing','activity'
  ]) as capability
) c
on conflict (tenant_id, capability) do nothing;

-- =========================
-- 5. login_attempts: add an identifier column so the failed-attempt limiter can
-- key on more than IP (e.g. a staff email). Existing IP-only rows keep working.
-- =========================
alter table public.login_attempts
  add column if not exists identifier text;

create index if not exists login_attempts_identifier_time_idx
  on public.login_attempts (identifier, created_at desc);
