-- 0047_client_intake.sql — the public client intake funnel (service-role only)
--
-- A submission has no tenant yet, so it cannot live in the `onboarding` table
-- from 0018 (which is keyed on tenant_id). It gets its own table, and gains a
-- tenant_id back-reference only once Jake approves it.
--
-- See docs/build-plans/client-onboarding-full.md.

create table if not exists public.intake_submissions (
  id             uuid primary key default gen_random_uuid(),
  resume_token   text not null unique,
  answers        jsonb not null default '{}'::jsonb,
  furthest_step  int not null default 1,
  -- in_progress | submitted | approved | rejected
  status         text not null default 'in_progress',
  login_email    text,
  -- Hashed at funnel step 3, never plaintext. Read once, at approve, to create
  -- the owner's staff_accounts row.
  password_hash  text,
  -- Null until approved. Its presence is also the idempotency guard on approve.
  tenant_id      uuid references public.tenants(id) on delete set null,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.intake_submissions enable row level security;
-- No policies: service-role only, same as onboarding / admin_tasks / admin_sop_flags.
-- The public funnel endpoints reach this table through the service client after
-- resolving an unguessable resume token, never through an anon-key session.

-- The queue reads by status, newest first.
create index if not exists intake_submissions_status_idx
  on public.intake_submissions (status, created_at desc);

-- Approve looks up by tenant to show the original answers in the setup cockpit.
create index if not exists intake_submissions_tenant_idx
  on public.intake_submissions (tenant_id);

-- Onboarding lifecycle for a client that exists but is not ready to be used.
-- 'setup'  = approved, tenant and login exist, the app shows a holding screen.
-- 'live'   = Go Live pressed, the app opens normally.
--
-- The default is 'live' ON PURPOSE. Every tenant that exists before this
-- migration keeps working exactly as it does today; no backfill is needed
-- because none is wanted. Only the approve path ever writes 'setup'.
alter table public.tenants
  add column if not exists onboarding_status text not null default 'live';
