-- 0055: put leads.status back to the vocabulary the deployed code speaks.
--
-- The cold-call stage rename was written to ship WITH its UI and was applied to
-- this database early, while origin/main still ships the 0034 vocabulary
-- ('New', 'Contacted', 'No Answer', 'Booked', 'Qualified', 'Closed', 'Dead').
-- A database that speaks a language the deployed code does not is worse than an
-- old vocabulary: the status tiles count nothing and every status edit fails the
-- CHECK. So it goes back, and the rename runs again with the ship.
--
-- The rename is parked at supabase/migrations/pending/. It is not lost.
--
-- Only demo-seed rows existed when this ran, so the one lossy edge in the
-- reverse map (old 'Closed' and old 'Booked' both landed on 'Booked' and cannot
-- be told apart coming back) cost nothing real.
--
-- Run AFTER 0001..0054. Idempotent: safe to re-run.

alter table public.leads
  drop constraint if exists leads_status_check;

update public.leads set status = case status
  when 'New Lead'         then 'New'
  when '1st Dial (Day 1)' then 'Contacted'
  when '2nd Dial (Day 2)' then 'No Answer'
  when 'Call Back'        then 'Qualified'
  when 'Brushed Off'      then 'No Answer'   -- no old equivalent; nearest truth
  when 'Not Interested'   then 'Dead'
  else status                                -- 'Booked' is in both vocabularies
end
where status in ('New Lead','1st Dial (Day 1)','2nd Dial (Day 2)',
                 'Call Back','Brushed Off','Not Interested');

alter table public.leads
  alter column status set default 'New';

alter table public.leads
  add constraint leads_status_check
  check (status in ('New','Contacted','No Answer','Booked','Qualified','Closed','Dead'));
