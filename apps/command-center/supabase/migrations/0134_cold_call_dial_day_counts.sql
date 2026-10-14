-- 0134: the cold call tracker counts its month in Postgres instead of in the Worker.
--
-- Same fault as 0126, in the file its memory note said was "the same shape but
-- only ~170 rows a month". September 2026 passed 1000 dials on the 25th. The
-- tracker read the month's rows with no order and no paging, PostgREST capped
-- the answer at 1000 (206, 0-999/1320), and the newest days fell off the end:
-- the 25th showed 81 of its 201 dials and the 28th showed none of its 200. Every
-- dial was recorded; only the reading was short.
--
-- Grouped by caller, day, outcome and the two stored flags, so a month is a few
-- hundred rows at most whatever the dialing volume. The counting RULES stay in
-- functions/lib/coldCallDials.ts (rollUpDialsByDay reads `dials` as a weight);
-- this view counts rows and decides nothing.
--
-- Run AFTER 0001..0133. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions.

create or replace view public.cold_call_dial_day_counts as
  select
    caller_id,
    day,
    spoke,
    pitched,
    outcome,
    count(*)::int as dials
  from public.cold_call_dials
  group by caller_id, day, spoke, pitched, outcome;

comment on view public.cold_call_dial_day_counts is
  'Dials per caller per day per outcome, for the Cold Call tracker. Grouped in Postgres so a busy month never loses its newest days to PostgREST''s 1000-row cap.';
