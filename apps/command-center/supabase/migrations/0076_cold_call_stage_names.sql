-- 0076: the stored dial stages take GoHighLevel's own names.
--
-- The two dial stages have been displayed as "No Answer Day 1" and "No Answer
-- Day 2" since 0061, but only displayed: the STORED status stayed "1st Dial
-- (Day 1)" / "2nd Dial (Day 2)", which is not what those stages are called in
-- GoHighLevel. The live agency pipeline reads:
--
--   New Lead -> No Answer Day 1 -> No Answer Day 2 -> Call Back -> Not Interested
--
-- That divergence was not cosmetic. planLeadSync (functions/lib/coldCallSync.ts)
-- accepts a GoHighLevel card only when its stage name is in the app's stored
-- vocabulary, so every card sitting in a No Answer stage failed that test and was
-- reported under skippedStages instead of being imported. The sync has therefore
-- never pulled a chased prospect into the book. Renaming the stored value to the
-- live stage name is the fix; there is nothing to change in GoHighLevel.
--
-- Booked is deliberately NOT in the new constraint's GHL-matching set. There is
-- no Booked stage on the Cold Calling pipeline: a booked demo moves to the Sales
-- pipeline at "Demo Call Booked". Booked stays a valid stored status because it
-- is how the app records that a lead has left the dialing operation, but nothing
-- expects to find it on the Cold Calling board.
--
-- Run AFTER 0001..0075. Idempotent: safe to re-run.

-- Drop first, so the rename cannot fail against the old constraint.
alter table public.leads
  drop constraint if exists leads_status_check;

update public.leads
   set status = 'No Answer Day 1'
 where status = '1st Dial (Day 1)';

update public.leads
   set status = 'No Answer Day 2'
 where status = '2nd Dial (Day 2)';

alter table public.leads
  add constraint leads_status_check
  check (status in ('New Lead','No Answer Day 1','No Answer Day 2',
                    'Call Back','Booked','Not Interested'));

comment on column public.leads.status is
  'The lead''s stage. Every value except Booked is a live stage name on the '
  'GoHighLevel "Cold Calling" pipeline, and the sync matches on it verbatim, so '
  'renaming one here means renaming it there. Booked is app-side only: a booked '
  'demo lives on the Sales pipeline at "Demo Call Booked".';
