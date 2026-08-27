-- A scrape run says when it last moved, so a stranded one can be picked back up.
--
-- The runner is a Windows logon task. The PC restarts or Jake logs out, the
-- runner dies mid-run, and the row is left reading 'running'. claim_next_run
-- only ever takes 'queued', so when the watcher comes back at logon it sees an
-- empty queue and idles, while the Leads page shows a scrape in progress and the
-- wizard refuses to start another. On 26 August that cost 9.5 hours out of a
-- 16.7 hour run, and it has cost whole days before that.
--
-- Nothing on the row could tell a live run from an abandoned one: started_at
-- says when it began, and the tallies move without saying when. This is the
-- missing fact. A run pushes its tallies after every keyword, about once a
-- minute, so an updated_at older than a quarter of an hour means nobody is
-- working it.
--
-- A trigger rather than the application writing it: the runner, the app's Stop
-- button and any hand-edit all have to stamp it, and one of the three would
-- eventually forget.
--
-- Idempotent: safe to re-run.

alter table public.scrape_runs
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_scrape_run()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scrape_runs_touch on public.scrape_runs;
create trigger scrape_runs_touch
  before update on public.scrape_runs
  for each row execute function public.touch_scrape_run();

-- Existing rows: a finished run is stamped with when it actually ended, rather
-- than with the moment this migration ran. Rows still in flight keep now(),
-- which is the safe direction to be wrong in: the worst case is that a genuinely
-- stranded run waits one more quarter of an hour to be noticed, where the other
-- direction would yank a live run out from under its runner.
update public.scrape_runs
   set updated_at = coalesce(finished_at, started_at, created_at)
 where status not in ('preparing', 'queued', 'running');

create index if not exists scrape_runs_stranded_idx
  on public.scrape_runs (host, status, updated_at);

comment on column public.scrape_runs.updated_at is
  'When the row last changed, stamped by trigger. The runner pushes its tallies '
  'after every keyword, so a run still reading ''running'' whose updated_at is '
  'older than REAP_STALE_AFTER in coordinator.py was abandoned by a dead runner '
  'and is put back on the queue to resume off its disk queue.';
