-- A run says how many leads it can actually send, not how many rows it stored.
--
-- scrape_runs.pass_rate is kept / raw: how much of what Google returned was worth
-- STORING. Since the 2026-08-20 qualifier fix that number is roughly honest, but
-- it is not the number anyone wants. A stored lead is not a lead you can ring:
-- across the two live trades, 94 qualified businesses are landlines against 48
-- that are dialable, so a run reporting its pass rate alone overstated what it
-- had found by about three times.
--
-- Two counts, written by the runner as it goes:
--   passed_count    above the trade's export gate AND confirmed by a Google
--                   category, so the trade is what the business IS
--   sendable_count  that, and on a mobile. The only number that answers "how many
--                   of these can go on a list today", because both send paths and
--                   the CSV refuse anything that is not wireless
--
-- Additive and idempotent. Old runs keep 0, which is correct: nothing counted it.

alter table public.scrape_runs
  add column if not exists passed_count int not null default 0,
  add column if not exists sendable_count int not null default 0;

comment on column public.scrape_runs.passed_count is
  'Leads above the trade''s export gate with a Google-confirmed category. Worth texting, subject to line type.';
comment on column public.scrape_runs.sendable_count is
  'passed_count that are also mobiles. What the run can actually hand to a channel today.';
