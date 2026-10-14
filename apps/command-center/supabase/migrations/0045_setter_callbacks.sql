-- 0045: setter_callbacks, the app-side mirror of dated follow-up tasks the
-- Setter Suite writes into a client's CRM.
--
-- Why a mirror exists at all: the CRM's API only lists tasks per contact, so
-- a "callbacks due today" rail across every lead would cost one API call per
-- contact on every board load. The rail reads THIS table instead; the CRM
-- task (ghl_task_id) stays the visible record for the client's own team.
-- Completing a callback in the suite marks both.
--
-- contact_name is denormalized on purpose, same cost logic: the rail would
-- otherwise need a contact fetch per row just to show a name.
--
-- Known v1 limitation, accepted in design: a task completed inside the CRM
-- does not clear its mirror row here.
--
-- Run AFTER 0001..0044. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts).

create table if not exists public.setter_callbacks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  contact_id    text not null,
  contact_name  text not null default '',
  title         text not null,
  due_at        timestamptz not null,
  ghl_task_id   text,
  status        text not null default 'pending' check (status in ('pending','done')),
  created_by    uuid references public.admin_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

alter table public.setter_callbacks enable row level security;
-- No policies: service-role only.

-- The rail queries one tenant's pending callbacks ordered by due time.
create index if not exists setter_callbacks_tenant_due_idx
  on public.setter_callbacks (tenant_id, status, due_at);
