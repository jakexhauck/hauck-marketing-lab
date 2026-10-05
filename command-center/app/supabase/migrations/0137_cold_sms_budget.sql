-- 0137: cold_sms_budget, Acquisition > SMS Budget (Jake, 2026-10-05).
--
-- One row per month of PLANNED cold SMS spend. `inputs` holds the typed cells
-- (volumes, rates, percentages) as a flat object of numbers or nulls, so a new
-- rate line is a code change and not a migration. `subscriptions` is an array
-- of { name, amount } flat monthly costs (GHL plan, Twilio top-up, ...).
--
-- Every cost line is COMPUTED in src/lib/coldSmsBudget.ts and never stored.
-- Actual spend stays in cold_sms_monthly; the page reads both.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.cold_sms_budget (
  id            uuid primary key default gen_random_uuid(),
  -- First-of-month (YYYY-MM-01). Normalized server-side before every upsert.
  month         date not null unique,
  inputs        jsonb not null default '{}'::jsonb,
  subscriptions jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.cold_sms_budget enable row level security;
