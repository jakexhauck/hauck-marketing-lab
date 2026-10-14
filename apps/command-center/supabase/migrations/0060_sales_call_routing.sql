-- 0060: routing a sales call's outcome into the agency's own Sales Pipeline,
-- and letting a meeting exist that the app did not book.
--
-- Two gaps this closes, both from Stage 2 and Stage 4 of
-- command-center/docs/build-plans/agency-ghl-connection.md.
--
-- 1. THE OUTCOME WENT NOWHERE. sales_calls has recorded closed / follow_up /
--    no_show / not_a_fit since 0057, and every one of them stopped inside this
--    database. The Sales Pipeline in GoHighLevel, which is where Jake actually
--    reads his month, held zero opportunities. `ghl_opportunity_id` is the
--    link that lets the app move a card instead of only remembering one.
--
-- 2. A MEETING ONLY EXISTED IF THE APP BOOKED IT. Rows were written by
--    cold-call/book.ts and by nothing else, so a meeting booked in GoHighLevel
--    directly, or one moved there afterwards, never reached the console.
--    `synced_at` and `source` carry which of the two put a row here, so the
--    page can say "this came off the calendar" rather than implying a caller
--    typed it.
--
-- Nothing here is required by the existing rows: every column is nullable or
-- defaulted, so 0057 data keeps working untouched and unrouted until somebody
-- records an outcome on it.
--
-- Run AFTER 0001..0059. Idempotent: safe to re-run.

alter table public.sales_calls
  -- The card in the Sales Pipeline. Null means the meeting has never been
  -- pushed, which is a different fact from a push that failed: see ghl_error.
  add column if not exists ghl_opportunity_id text,

  -- The last time this row was reconciled against the GoHighLevel calendar.
  -- Null on a row the app booked and never re-read.
  add column if not exists synced_at timestamptz,

  -- Why the last push did not land, in words fit to show in the console. Null
  -- when the last push worked, and cleared on a success, so a stale error can
  -- never sit beside a card that is now correct.
  add column if not exists ghl_error text,

  -- Which stage this row believes its opportunity is sitting in. Stored so the
  -- console can show a routing that has drifted (somebody moved the card by
  -- hand in GoHighLevel) instead of silently asserting the app's version.
  add column if not exists ghl_stage text;

-- One prospect's card, from the opportunity side: used when reconciling a board
-- that was moved by hand.
create index if not exists sales_calls_opportunity_idx
  on public.sales_calls (ghl_opportunity_id)
  where ghl_opportunity_id is not null;

-- The sync writes by appointment id and needs the unique index that 0057
-- already created; nothing to add for it here.

comment on column public.sales_calls.ghl_opportunity_id is
  'The card this meeting owns in the agency Sales Pipeline. Null means never pushed; a push that failed sets ghl_error instead.';

comment on column public.sales_calls.synced_at is
  'Last reconciliation against the GoHighLevel calendar. Null on a row the app booked and never re-read.';

comment on column public.sales_calls.ghl_error is
  'Why the last push to GoHighLevel did not land, in words fit for the console. Cleared on success.';

comment on column public.sales_calls.ghl_stage is
  'The Sales Pipeline stage the app last put this card in. Compared against the live board to show drift rather than assert.';
