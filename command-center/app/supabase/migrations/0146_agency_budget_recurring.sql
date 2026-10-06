-- 0146: agency_budget_recurring, Operations > Budget > Recurring (Jake,
-- 2026-10-06).
--
-- ONE row (id = 1) holding the whole recurring list as jsonb: an array of
-- { id, name, category, amount, start, end } where start/end are YYYY-MM and
-- end null means still running. The page writes the list whole, like
-- agency_budget. Which months an expense counts in is COMPUTED in
-- src/lib/agencyBudget.ts and never stored per month.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.agency_budget_recurring (
  id         integer primary key default 1 check (id = 1),
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agency_budget_recurring enable row level security;
