-- 0155: the outcome page's job answers (Jake, 2026-10-10). Once a job is
-- booked the owner can say how it went: done, rescheduled or cancelled.
alter table public.lead_link_outcomes
  drop constraint if exists lead_link_outcomes_outcome_chk;
alter table public.lead_link_outcomes
  add constraint lead_link_outcomes_outcome_chk
  check (outcome in (
    'estimate_booked', 'call_back', 'not_interested', 'job_closed', 'no_answer',
    'job_done', 'job_rescheduled', 'job_cancelled'
  ));
