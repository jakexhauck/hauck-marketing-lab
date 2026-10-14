-- 0068: three columns that have existed since 0057 finally mean something.
--
-- NOTHING STRUCTURAL HAPPENS HERE. No column is added, dropped, renamed or
-- rewritten: this migration is comments only, so it can be run against the live
-- database while the deployed app is mid-version and change nothing it reads.
-- The features it documents work whether or not it has run. It exists because a
-- column whose meaning has changed and whose comment has not is a trap for the
-- next person, and that person is usually me.
--
-- What changed above the database, from docs/build-plans/sales-five-additions.md:
--
--   deal              was never written. It now carries the retainer sold on a
--                     close: { monthly, months }. Contract value is monthly *
--                     months and is DERIVED at read time, never stored, so the
--                     two can never disagree.
--   not_a_fit_reason  was only ever written on a not_qualified meeting, and by
--                     nothing at all in the end. It now carries the reason for
--                     EITHER kind of no, keyed from SALES_NO_REASONS in
--                     functions/lib/salesCalls.ts. The column keeps its 0057
--                     name: renaming it would break the deployed app's select
--                     list for the sake of tidiness.
--   scratchpad        was never written. It now carries the notes taken when an
--                     outcome is recorded, on any outcome.
--
-- Run AFTER 0001..0067. Idempotent: safe to re-run, and safe to never run.

comment on column public.sales_calls.deal is
  'What was sold, on a close: { monthly, months }, months null for month-to-month. Written by the record panel (0068); null on every row recorded before it and on a close where nobody filled the figures in. Contract value is monthly * months, derived at read time and never stored. Parsed by functions/lib/salesCalls.ts:parseDeal, which is the only thing that decides what counts as a deal.';

comment on column public.sales_calls.not_a_fit_reason is
  'Why they said no, on EITHER kind of no (0068): a key from SALES_NO_REASONS in functions/lib/salesCalls.ts, not free text. Required by the API on not_interested and not_qualified, and null on every other outcome. Keeps its 0057 name, which said not-a-fit because that was the only outcome it applied to then.';

comment on column public.sales_calls.scratchpad is
  'Notes taken when the outcome was recorded, on any outcome (0068). Belongs to the meeting rather than to the outcome, so re-recording an answer without retyping them leaves them alone. Capped at 4000 characters by the API.';
