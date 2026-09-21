-- A scrape run can be held: parked by Hold on the page, or by reaching its cap.
--
-- Held is its own status ('held'), neither ended nor queued. The watcher only
-- claims 'queued', so a held run sits still until Continue on the page puts it
-- back; the reaper only touches 'running', so it is never mistaken for a run
-- whose runner died. Its place is on the disk of the machine that started it
-- (lead-scraper/data/queue_<id>.jsonl), which is why the runner only claims a
-- queued run whose host is null or its own.
--
-- lead_cap  = how many new leads to take per stretch, picked in the wizard.
--             Null means no cap.
-- hold_at   = the running new_count to stop at. Starts equal to lead_cap;
--             Continue moves it to new_count + lead_cap, so a run capped at 200
--             holds near 200, then near 400. Null means no automatic hold.
--
-- status stays free text (no check constraint on it anywhere), so 'held' needs
-- no constraint change.
--
-- Idempotent: safe to re-run.

alter table public.scrape_runs
  add column if not exists lead_cap int,
  add column if not exists hold_at int;

comment on column public.scrape_runs.lead_cap is
  'New leads per stretch, from the wizard. The runner holds the run when new_count reaches hold_at. Null = no cap.';
comment on column public.scrape_runs.hold_at is
  'The new_count at which the runner parks this run as held. Continue sets it to new_count + lead_cap. Null = never hold automatically.';
