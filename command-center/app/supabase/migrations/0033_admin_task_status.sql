-- 0033: task status + updates. Backs the Operations pillar's Tasks tab, which
-- replaces the old standalone /admin/tasks page with an editable checklist.
--
-- Reuses admin_tasks (0012 + 0020). Two new columns:
--   status   the three-way pill (To do / Doing / Done). The Done checkbox stays
--            in `completed`; the API keeps the pair coupled on every write
--            (functions/lib/taskStatus.ts), so status is the richer view of the
--            same fact rather than a second source of truth.
--   updates  the checklist's free-text "Updates" cell (nullable).
--
-- No new index: admin_tasks_listing_idx (completed, created_at desc) already
-- orders the listing open-first.
--
-- Run AFTER 0001..0032. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

alter table public.admin_tasks
  add column if not exists status  text not null default 'todo',
  add column if not exists updates text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_tasks_status_check'
  ) then
    alter table public.admin_tasks
      add constraint admin_tasks_status_check
      check (status in ('todo', 'doing', 'done'));
  end if;
end $$;

-- Backfill: every pre-existing row defaulted to 'todo', so lift the ones that
-- were already checked off. Idempotent (a re-run matches nothing new).
update public.admin_tasks
   set status = 'done'
 where completed = true
   and status <> 'done';
