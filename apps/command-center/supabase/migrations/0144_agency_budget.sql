-- 0144: agency_budget, Operations > Budget (Jake, 2026-10-06).
--
-- One row per month of what the agency actually spent. `items` is an array of
-- { id, name, category, amount } line items (amount in dollars). Totals and the
-- category split are COMPUTED in src/lib/agencyBudget.ts and never stored.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.agency_budget (
  id         uuid primary key default gen_random_uuid(),
  -- First-of-month (YYYY-MM-01). Normalized server-side before every upsert.
  month      date not null unique,
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agency_budget enable row level security;
