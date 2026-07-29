-- 0057: Leads speak the pipeline's language.
--
-- PARKED, ON PURPOSE. This directory is invisible to scripts/db-migrate.mjs
-- (it only reads *.sql at the top level), which is what "written, NOT run"
-- actually requires: a file sitting in migrations/ gets applied by the next
-- db:migrate anyone runs. It was, once, ahead of its UI, and 0055 undid it.
--
-- Move it up to supabase/migrations/ in the same commit that ships the Cold
-- Call stage pages, and confirm the number then (main was at 0054).
--
-- The lead book shipped with an invented status vocabulary (New, Contacted,
-- No Answer, Booked, Qualified, Closed, Dead). The agency GHL sub-account now
-- has a real Cold Call Leads pipeline, and Acquisition > Cold Calling renders
-- one page per stage of it, so the stored status becomes the stage name and the
-- two can never mean different things.
--
-- Run AFTER 0001..0047. Idempotent: safe to re-run.

-- The old constraint has to go before the values can move.
alter table public.leads
  drop constraint if exists leads_status_check;

-- Map the retired vocabulary onto the pipeline. Two of these are lossy and are
-- deliberate calls: Qualified was only ever used for "wants another call", and
-- Closed for a booked deal, which the cold call pipeline ends at Booked.
update public.leads set status = case status
  when 'New'       then 'New Lead'
  when 'Contacted' then '1st Dial (Day 1)'
  when 'No Answer' then '2nd Dial (Day 2)'
  when 'Qualified' then 'Call Back'
  when 'Closed'    then 'Booked'
  when 'Dead'      then 'Not Interested'
  else status                       -- 'Booked' already matches a stage name
end
where status in ('New','Contacted','No Answer','Qualified','Closed','Dead');

alter table public.leads
  alter column status set default 'New Lead';

alter table public.leads
  add constraint leads_status_check
  check (status in ('New Lead','1st Dial (Day 1)','2nd Dial (Day 2)',
                    'Brushed Off','Call Back','Booked','Not Interested'));
