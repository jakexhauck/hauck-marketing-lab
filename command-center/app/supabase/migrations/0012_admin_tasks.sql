-- 0012: agency task list (the admin "Tasks" tab).
--
-- A simple shared to-do list for the agency operators, surfaced in the admin
-- console alongside the cross-tenant client list. Each task is categorized:
-- either an agency-wide task (tenant_id null) or one tied to a specific client
-- (tenant_id set). Tasks are shared across all admins (there is effectively one
-- operator today); created_by records who added it for a light footprint.
--
-- Distinct from the per-CONTACT tasks in GoHighLevel (those live in GHL, scoped
-- to one client's contact). These are the agency's own internal tasks.
--
-- Run AFTER 0001..0011. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.admin_tasks (
  id          uuid primary key default gen_random_uuid(),
  -- null = an agency-wide task. Otherwise the client this task is for. Cascades
  -- so deleting a client clears its tasks rather than leaving orphans.
  tenant_id   uuid references public.tenants(id) on delete cascade,
  title       text not null,
  due_date    date,
  completed   boolean not null default false,
  -- Who added it. Set null (not cascade-delete the task) if that admin is removed.
  created_by  uuid references public.admin_accounts(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Open-tasks-first listing: incomplete before complete, newest first within each.
create index if not exists admin_tasks_listing_idx
  on public.admin_tasks (completed, created_at desc);

create index if not exists admin_tasks_tenant_idx
  on public.admin_tasks (tenant_id);

alter table public.admin_tasks enable row level security;
-- No policies: service-role only, same as admin_accounts/admin_audit_log.
