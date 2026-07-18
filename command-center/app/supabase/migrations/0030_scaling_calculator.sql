-- 0030: scaling calculator inputs. Backs the Operations pillar's Calculator tab
-- (docs/build-plans/admin-redesign/08-scaling-calculator.md).
--
-- Agency-internal, so no tenant_id: this is Jake's own set of numbers. The
-- calculator only ever remembers ONE set of inputs, so the table is a singleton:
-- id is pinned to 1 by a CHECK and the row is seeded here, and the endpoint
-- upserts onto id = 1.
--
-- Percentages are stored as whole numbers (20 = 20%), matching the input fields;
-- the pure lib (src/lib/scalingCalculator.ts) divides by 100. Defaults match
-- DEFAULT_INPUTS there, so a fresh install and a missing row agree.
--
-- No RLS: the API reads and writes with the service-role client behind the
-- /api/admin/* middleware.
--
-- Run AFTER 0001..0029. Idempotent: safe to re-run.

create table if not exists public.scaling_calculator (
  id                int primary key default 1,
  current_revenue   numeric not null default 0,
  monthly_cash_goal numeric not null default 10000,
  offer_price       numeric not null default 1000,
  avg_cash_close    numeric not null default 1000,
  closing_pct       numeric not null default 20,
  show_rate_pct     numeric not null default 60,
  booking_rate_pct  numeric not null default 2,
  updated_at        timestamptz not null default now(),
  constraint scaling_calculator_singleton check (id = 1)
);

insert into public.scaling_calculator (id) values (1)
  on conflict (id) do nothing;
