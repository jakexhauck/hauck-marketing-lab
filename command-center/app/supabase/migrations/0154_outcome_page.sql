-- 0154: the universal owner outcome page (api/outcome, lib/outcome.ts).
--
-- Same row as before (lead_link_outcomes, one per lead, latest tap wins), with
-- two more answers, per Jake 2026-10-10:
--   job_closed   sold on the call: amount_cents, a job on the Job calendar
--                (job_appointment_id) and a customer_jobs row (customer_job_id),
--                which the Ads Dashboard counts as a job
--   no_answer    attempts + 1 and a call-back this time tomorrow, reminded
--                like a call_back
--
-- Idempotent.

alter table public.lead_link_outcomes
  add column if not exists amount_cents        integer,
  add column if not exists job_appointment_id  text,
  add column if not exists customer_job_id     uuid,
  add column if not exists attempts            integer not null default 0;

alter table public.lead_link_outcomes
  drop constraint if exists lead_link_outcomes_outcome_chk;
alter table public.lead_link_outcomes
  add constraint lead_link_outcomes_outcome_chk
  check (outcome in ('estimate_booked', 'call_back', 'not_interested', 'job_closed', 'no_answer'));

-- The reminder queue now holds no-answers too.
drop index if exists public.lead_link_outcomes_due_idx;
create index if not exists lead_link_outcomes_due_idx
  on public.lead_link_outcomes (call_back_at)
  where outcome in ('call_back', 'no_answer') and reminded_at is null;
