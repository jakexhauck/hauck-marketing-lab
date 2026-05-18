-- Hauck Dashboard initial schema.
-- Paste this into Supabase dashboard → SQL Editor → New query → Run.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- =========================
-- tenants
-- =========================
create table if not exists public.tenants (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  niche           text not null,
  brand_color     text not null,
  brand_initials  text not null,
  app_name        text not null,
  won_label       text not null default 'Won',
  value_label     text not null default 'Job Value',
  ghl_location_id text not null,
  ghl_token       text not null,
  monthly_spend   numeric default 0,
  created_at      timestamptz not null default now()
);

-- =========================
-- tenant_users
-- =========================
create table if not exists public.tenant_users (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','manager','rep')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_users_user_idx on public.tenant_users(user_id);

-- =========================
-- push_subscriptions
-- =========================
create table if not exists public.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- =========================
-- activity_log
-- =========================
create table if not exists public.activity_log (
  id          bigserial primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  lead_id     text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_tenant_time_idx
  on public.activity_log(tenant_id, created_at desc);

-- =========================
-- Row-level security
-- =========================
alter table public.tenants            enable row level security;
alter table public.tenant_users       enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.activity_log       enable row level security;

-- Tenants: a user can read tenants they belong to.
-- Note: ghl_token is sensitive. We selectively grant read of non-secret columns via the
-- get_my_tenant() function below. Direct selects from `tenants` still need to omit ghl_token
-- in client queries.
drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select using (
    exists (
      select 1 from public.tenant_users tu
      where tu.tenant_id = tenants.id
        and tu.user_id = auth.uid()
    )
  );

drop policy if exists tenant_users_read on public.tenant_users;
create policy tenant_users_read on public.tenant_users
  for select using (user_id = auth.uid());

drop policy if exists push_subscriptions_rw on public.push_subscriptions;
create policy push_subscriptions_rw on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log
  for select using (
    exists (
      select 1 from public.tenant_users tu
      where tu.tenant_id = activity_log.tenant_id
        and tu.user_id = auth.uid()
    )
  );

-- =========================
-- RPC: get_my_tenant
-- Returns the calling user's tenant config WITHOUT the ghl_token.
-- If user belongs to multiple tenants, returns the first by created_at.
-- =========================
create or replace function public.get_my_tenant()
returns table (
  id              uuid,
  slug            text,
  name            text,
  niche           text,
  brand_color     text,
  brand_initials  text,
  app_name        text,
  won_label       text,
  value_label     text,
  monthly_spend   numeric,
  role            text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    t.id, t.slug, t.name, t.niche,
    t.brand_color, t.brand_initials, t.app_name,
    t.won_label, t.value_label, t.monthly_spend,
    tu.role
  from tenants t
  join tenant_users tu on tu.tenant_id = t.id
  where tu.user_id = auth.uid()
  order by t.created_at asc
  limit 1;
$$;

grant execute on function public.get_my_tenant() to authenticated;
