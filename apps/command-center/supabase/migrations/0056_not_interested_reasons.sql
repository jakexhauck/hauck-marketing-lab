-- 0056: Brushed Off stops being a stage and becomes a reason.
--
-- A brush-off was never a place a lead lives; it is why a lead said no. Keeping
-- it as a pipeline stage meant a page nobody worked and a second answer to
-- "where is this prospect", so the stage goes and the information it carried
-- moves onto the dial that recorded it.
--
-- The reasons are deliberately a controlled list rather than free text: this is
-- the data that answers "why are we losing them", and a typed note cannot be
-- counted. The note column is still there for the sentence that does not fit.
--
-- Every reason implies an outcome, and the API derives spoke/pitched from that
-- outcome rather than trusting the client, so these rows stay countable:
--   pitched_no, has_agency        -> not_interested (spoke, pitched)
--   no_engage, not_decision_maker,
--   bad_fit                       -> brush_off      (spoke, never pitched)
--
-- Jake removes the Brushed Off stage and its `cc brush off` automation in
-- GoHighLevel; this moves the leads already sitting in it.
--
-- Run AFTER 0001..0055. Idempotent: safe to re-run.

-- The one existing Brushed Off lead becomes Not Interested before the
-- constraint stops naming that stage.
alter table public.leads
  drop constraint if exists leads_status_check;

update public.leads
   set status = 'Not Interested'
 where status = 'Brushed Off';

alter table public.leads
  add constraint leads_status_check
  check (status in ('New Lead','1st Dial (Day 1)','2nd Dial (Day 2)',
                    'Call Back','Booked','Not Interested'));

-- Why they said no. Null for every dial that is not a no, and for the rows
-- written before this existed.
alter table public.cold_call_dials
  add column if not exists reason text;

alter table public.cold_call_dials
  drop constraint if exists cold_call_dials_reason_check;

alter table public.cold_call_dials
  add constraint cold_call_dials_reason_check
  check (reason is null or reason in
    ('pitched_no','no_engage','not_decision_maker','has_agency','bad_fit'));

comment on column public.cold_call_dials.reason is
  'Why the prospect said no, from a fixed list. Null unless the outcome was a no. The outcome (and therefore spoke/pitched) is derived from it server-side.';

-- "Why are we losing them", by month, is the report this column exists for.
create index if not exists cold_call_dials_reason_idx
  on public.cold_call_dials (reason, day)
  where reason is not null;
