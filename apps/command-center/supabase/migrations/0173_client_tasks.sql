-- 0173: a client's setup tasks, the per-client Director (Jake, 2026-10-20;
-- docs/build-plans/client-fulfillment-and-director.md, Build 2).
--
-- The Client Fulfillment map (src/lib/agentSops.ts) is the process; these rows
-- are the work for one client. Seeded from the map the first time a client's
-- tasks are read, with the old Brief ticks (onboarding_checklist sop: rows)
-- carried over as done. key is stable (<box>:<name slug>, or added:<slug>) so
-- the Manager's kickoff card can name a task; (tenant_id, key) is unique so
-- two first reads at once cannot seed twice.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.client_tasks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  key         text not null check (length(key) between 1 and 200),
  phase       text not null,
  owner       text not null check (owner in ('client','jake','manager','research','ads','creative','landing','ghl','reporting')),
  name        text not null check (length(name) between 1 and 120),
  steps       jsonb not null default '[]'::jsonb,
  position    integer not null default 0,
  source_node text,
  sop_key     text,
  state       text not null default 'todo' check (state in ('todo','doing','done','cut')),
  change      text not null default 'kept' check (change in ('kept','changed','added')),
  reason      text,
  evidence    text,
  note        text,
  done_by     text,
  done_at     timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

create index if not exists client_tasks_tenant on public.client_tasks (tenant_id);

alter table public.client_tasks enable row level security;

-- The touch function is 0166's.
drop trigger if exists client_tasks_touch on public.client_tasks;
create trigger client_tasks_touch before update on public.client_tasks
  for each row execute function public.touch_agent_row();
