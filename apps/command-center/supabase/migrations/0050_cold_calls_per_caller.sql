-- 0050: the dialing tracker becomes one row per person per day.
--
-- cold_calls (0035) was built when Jake was the only person dialing: one row per
-- calendar day, `day` unique, no name on it. With a caller on the phones that
-- number is meaningless. Whose 60 dials were those? Whose pickup rate is 18%?
-- Nobody can answer, and a commission gets paid against it.
--
-- caller_id is the answer, and the uniqueness moves with it: a day is now unique
-- PER CALLER, so two people can log the same Tuesday without colliding.
--
-- Existing rows are Jake's, so they are backfilled to the oldest owner account
-- rather than left ownerless. His history stays his, and the month he is halfway
-- through does not reset to blank.
--
-- Run AFTER 0001..0049. Idempotent: safe to re-run.

alter table public.cold_calls
  add column if not exists caller_id uuid
    references public.admin_accounts(id) on delete cascade;

-- Backfill: every pre-0050 row belongs to the founding owner account. Guarded so
-- a re-run cannot reassign rows that have since been written by someone else.
update public.cold_calls
set caller_id = (
  select id from public.admin_accounts
  where role = 'owner' and status = 'active'
  order by created_at asc
  limit 1
)
where caller_id is null;

-- The old constraint said one row per day for the whole agency. Drop it before
-- the new one, or the second caller to log a Tuesday is rejected.
alter table public.cold_calls
  drop constraint if exists cold_calls_day_key;

drop index if exists cold_calls_day_key;

create unique index if not exists cold_calls_day_caller_idx
  on public.cold_calls (day, caller_id);

-- Every read is one person's month.
create index if not exists cold_calls_caller_day_idx
  on public.cold_calls (caller_id, day desc);

comment on column public.cold_calls.caller_id is
  'Whose dialing day this row is. Set from the session on every write; an owner may read anyone''s, a caller only their own.';
