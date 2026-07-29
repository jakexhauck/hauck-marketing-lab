-- 0067: rename two outcomes to the vocabulary the live automation actually uses.
--
-- 0065 named the two flavours of "no" after what the board called them at the
-- time: no_close (heard the pitch, said no) and not_a_fit (never a prospect).
-- The Sales board and its workflows were rebuilt on 2026-07-29 and now call the
-- same two things "not interested" and "not qualified", with a tag each. The
-- app writing sc no close / sc not a fit meant two buttons applying tags no
-- workflow listens for: the tag landed, the card never moved, and nothing said
-- so.
--
-- Same two meanings, renamed to match the CRM. The distinction itself is
-- unchanged and still worth having: one is a fact about the pitch, the other a
-- fact about the list.
--
--   no_close   -> not_interested
--   not_a_fit  -> not_qualified
--
-- Existing rows are migrated before the constraint is replaced, so no row is
-- ever left holding a value the new constraint would refuse. Both were only
-- recordable for a few hours and no meeting has carried either, but the UPDATEs
-- run regardless: a migration that is only correct on an empty table is a
-- migration waiting to fail on a restore.
--
-- Run AFTER 0001..0066. Idempotent: safe to re-run.

-- Constraint off first, so the rewrite cannot trip over it.
alter table public.sales_calls
  drop constraint if exists sales_calls_outcome_check;

update public.sales_calls set outcome = 'not_interested' where outcome = 'no_close';
update public.sales_calls set outcome = 'not_qualified'  where outcome = 'not_a_fit';

alter table public.sales_calls
  add constraint sales_calls_outcome_check
  check (outcome is null or outcome in
    ('closed','follow_up','not_interested','not_qualified','no_show'));

comment on column public.sales_calls.outcome is
  'What the meeting produced. Null until it has happened. A no_show is an outcome, not a status: the slot was reached and nobody came. not_interested is "heard the pitch, said no" and stays qualified; not_qualified is "never a prospect".';

comment on column public.sales_calls.not_a_fit_reason is
  'Why a not_qualified meeting was not a fit. The column keeps its 0057 name; the outcome it belongs to was renamed in 0067.';
