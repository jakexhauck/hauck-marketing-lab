-- 0064: the time of day a callback was agreed for.
--
-- follow_up_date (0034) has always been a day. A prospect who says "call me
-- Thursday" and one who says "call me Thursday at 2" were stored identically,
-- so the caller either wrote the time into notes or lost it, and the task that
-- lands in GoHighLevel was pinned to 9am whatever was actually agreed.
--
-- Added ALONGSIDE the date rather than replacing it with a timestamptz. Every
-- read of follow_up_date (the Callbacks queue, its overdue badges, the sortable
-- book, the stage rules in 0055) keeps working untouched, and a callback with
-- no agreed time stays exactly what it was: a day.
--
-- Nullable on purpose and staying that way. "Thursday, some time" is a real
-- thing a prospect says, and inventing 9am for it would put a made-up
-- appointment on somebody's screen.
--
-- Run AFTER 0001..0063. Idempotent: safe to re-run.

alter table public.leads
  add column if not exists follow_up_time time;

comment on column public.leads.follow_up_time is
  'Time of day agreed for the callback, in the agency timezone. Null means a day was agreed but no time.';
