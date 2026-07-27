-- 0055: the lead book speaks the pipeline's language.
--
-- Cold Call's pages become the stages of the agency's Cold Calling pipeline, one
-- page per stage. For a lead to file under a stage, the stored status has to BE
-- the stage name, so the seven invented statuses are replaced by the seven live
-- ones and the existing rows are mapped across.
--
-- Mapping, and why:
--   New       -> New Lead          never dialed, same meaning
--   Contacted -> Brushed Off       "picked up, did not engage" is what the app
--                                  wrote for a brush-off; a callback also wrote
--                                  Contacted but carries a follow_up_date, so
--                                  those are sent to Call Back below instead
--   No Answer -> 1st Dial (Day 1)  refined by attempt count below
--   Booked    -> Booked            unchanged
--   Qualified -> Call Back         only ever meant "wants another conversation"
--   Closed    -> Booked            the cold call pipeline ends at Booked
--   Dead      -> Not Interested    same meaning
--
-- Run AFTER 0001..0054. Idempotent: safe to re-run.

alter table public.leads
  drop constraint if exists leads_status_check;

-- A "Contacted" row with a follow-up date was a callback, not a brush-off. Do
-- this one first, while the old vocabulary is still readable.
update public.leads
   set status = 'Call Back'
 where status = 'Contacted'
   and follow_up_date is not null;

-- No-answer rows split by how many attempts they have already had, which is the
-- distinction the two dial stages exist to make.
update public.leads
   set status = case when coalesce(no_answer, 0) >= 2
                     then '2nd Dial (Day 2)'
                     else '1st Dial (Day 1)' end
 where status = 'No Answer';

update public.leads set status = case status
  when 'New'       then 'New Lead'
  when 'Contacted' then 'Brushed Off'
  when 'Qualified' then 'Call Back'
  when 'Closed'    then 'Booked'
  when 'Dead'      then 'Not Interested'
  else status
end
where status in ('New','Contacted','Qualified','Closed','Dead');

alter table public.leads
  alter column status set default 'New Lead';

alter table public.leads
  add constraint leads_status_check
  check (status in ('New Lead','1st Dial (Day 1)','2nd Dial (Day 2)',
                    'Brushed Off','Call Back','Booked','Not Interested'));
