-- Fixes 0124's backfill, which silently did nothing.
--
-- 0124 created the touch trigger and THEN backfilled updated_at on finished
-- runs. The trigger is BEFORE UPDATE and sets new.updated_at := now()
-- unconditionally, so it stamped the migration's own clock over every value the
-- backfill wrote. Every row in the table, finished last week or running right
-- now, came out reading the same second.
--
-- Harmless for the reaper, which only ever looks at rows still saying 'running',
-- and wrong for anybody reading the column. So: drop the trigger, backfill, put
-- the trigger back.
--
-- Idempotent, and correct in either order on a fresh database.

drop trigger if exists scrape_runs_touch on public.scrape_runs;

update public.scrape_runs
   set updated_at = coalesce(finished_at, started_at, created_at)
 where status not in ('preparing', 'queued', 'running');

create trigger scrape_runs_touch
  before update on public.scrape_runs
  for each row execute function public.touch_scrape_run();
