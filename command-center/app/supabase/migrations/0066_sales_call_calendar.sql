-- 0066: remember which calendar a meeting was booked under.
--
-- The sync reads a set of calendars and writes a row per appointment, then
-- throws away which calendar each one came from. With a single sales calendar
-- that cost nothing. The moment there are two (a demo calendar and a sales
-- calendar, say) the Sales Calls page cannot answer "show me the demo calls",
-- and the funnel silently mixes two different conversations into one show rate.
--
-- Both columns, not just the id: the id is the identity and survives a rename,
-- the name is what a human reads and survives the calendar being DELETED in
-- GoHighLevel. Storing only the id would mean a deleted calendar's meetings
-- become unlabelable history; storing only the name would break the grouping
-- the first time one is renamed.
--
-- Nullable, because every row written before this migration has no answer and
-- inventing one would be worse than an honest blank. The next sync fills them
-- in: it writes these columns on every pass, not only on insert.
--
-- Run AFTER 0001..0065. Idempotent: safe to re-run.

alter table public.sales_calls
  add column if not exists calendar_id text,
  add column if not exists calendar_name text;

-- The Sales Calls picker filters on this, and the sync reads by it.
create index if not exists sales_calls_calendar_idx
  on public.sales_calls (calendar_id)
  where calendar_id is not null;

comment on column public.sales_calls.calendar_id is
  'The GoHighLevel calendar this meeting was booked under. Null on rows written before 0066; the next sync fills them.';

comment on column public.sales_calls.calendar_name is
  'The calendar''s name as it read at the last sync. Kept alongside the id so a deleted calendar''s meetings can still be labelled.';
