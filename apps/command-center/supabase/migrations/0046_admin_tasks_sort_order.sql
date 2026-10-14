-- 0046: manual ordering for the Operations checklist (admin Tasks tab).
--
-- Drag-to-reorder needs a persisted position, so admin_tasks gains sort_order.
-- Backfill mirrors what the list showed before this column existed (open rows
-- first, newest first within each), so the first load after deploy changes
-- nothing visually. New rows are appended by the POST endpoint (max + 1); the
-- default 0 only backstops any other insert path.
--
-- Run AFTER 0001..0045. Idempotent: safe to re-run (the backfill only touches
-- rows that are still null).
-- Reached only via the service-role client in Functions (RLS on, no policies).

alter table public.admin_tasks
  add column if not exists sort_order integer;

update public.admin_tasks t
set sort_order = ranked.rn
from (
  select id,
         row_number() over (order by completed asc, created_at desc) - 1 as rn
  from public.admin_tasks
) ranked
where t.id = ranked.id
  and t.sort_order is null;

alter table public.admin_tasks
  alter column sort_order set default 0;

alter table public.admin_tasks
  alter column sort_order set not null;

-- The standalone listing now reads (completed, sort_order).
create index if not exists admin_tasks_sort_idx
  on public.admin_tasks (completed, sort_order);
