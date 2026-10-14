-- 0145: cold_sms_cost_daily, the automatic cold SMS cost on Operations > Budget
-- (Jake, 2026-10-06).
--
-- One row per UTC day of texts counted on the Cold SMS LC Phone number from
-- GHL's message export: texts out and replies in, with segments. Dollars are
-- COMPUTED at read time from the month's SMS Budget rates
-- (functions/lib/coldSmsCost.ts), never stored, so changing a rate re-prices
-- the whole month.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.cold_sms_cost_daily (
  day          date primary key,
  out_count    integer not null default 0,
  out_segments integer not null default 0,
  in_count     integer not null default 0,
  in_segments  integer not null default 0,
  synced_at    timestamptz not null default now()
);

alter table public.cold_sms_cost_daily enable row level security;
