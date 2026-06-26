-- 0018_onboarding.sql — agency onboarding wizard state (service-role only)

create table if not exists public.onboarding (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  fields           jsonb not null default '{}'::jsonb,
  status           text  not null default 'draft',
  provision_result jsonb,
  provisioned_at   timestamptz,
  updated_at       timestamptz not null default now()
);

alter table public.onboarding enable row level security;
-- No policies: service-role only, same as admin_tasks/admin_sop_flags.

create table if not exists public.onboarding_checklist (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  task_key   text not null,
  done       boolean not null default false,
  value      text,
  done_at    timestamptz,
  done_by    text,
  primary key (tenant_id, task_key)
);

alter table public.onboarding_checklist enable row level security;
-- No policies: service-role only.
