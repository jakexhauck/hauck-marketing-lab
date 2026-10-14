-- 0065: a fifth sales-call outcome, and recording the tag rather than the stage.
--
-- Two changes, both from docs/build-plans/sales-call-tags.md.
--
-- 1. NO-CLOSE. The four outcomes since 0057 made "not a fit" carry two very
--    different meetings: the prospect who heard the pitch and said no (still a
--    qualified prospect, worth a nurture) and the one who was never a fit
--    (disqualified). The board has had separate columns for these all along;
--    the console only had one button. `no_close` is the missing one.
--
-- 2. THE APP STOPPED WRITING STAGES. It applies a tag and Jake's own workflow
--    moves the card, which is the convention the Setter Suite and Cold Call
--    already follow. `ghl_stage` recorded a stage this app asserted; nothing
--    asserts one now, so `ghl_tag` records what was actually written instead.
--    ghl_stage is KEPT and left alone: it holds what the old routing did, and
--    deleting a column to tidy up loses the only record of it.
--
-- Run AFTER 0001..0064. Idempotent: safe to re-run.

-- The CHECK is recreated rather than altered: Postgres has no "add a value to a
-- check constraint", and the constraint was created inline by 0057 so its name
-- is the generated one.
alter table public.sales_calls
  drop constraint if exists sales_calls_outcome_check;

alter table public.sales_calls
  add constraint sales_calls_outcome_check
  check (outcome is null or outcome in
    ('closed','follow_up','no_close','no_show','not_a_fit'));

alter table public.sales_calls
  -- The tag this app last applied to the contact for this meeting. One of the
  -- `sc ` tags in functions/lib/salesCallTags.ts. Null on a row recorded before
  -- the app tagged anything, and on one whose push failed (see ghl_error).
  add column if not exists ghl_tag text;

comment on column public.sales_calls.ghl_tag is
  'The sc tag this app last applied to the contact for this meeting. The app writes no pipeline stage: the tag is what moves the card, in Jake''s own workflow.';

comment on column public.sales_calls.ghl_stage is
  'Historic. The stage the app asserted back when it moved cards itself (0060). Nothing writes this any more; see ghl_tag.';

comment on column public.sales_calls.outcome is
  'What the meeting produced. Null until it has happened. A no_show is an outcome, not a status: the slot was reached and nobody came. no_close is "heard it, said no" and stays qualified; not_a_fit is "never a fit".';
