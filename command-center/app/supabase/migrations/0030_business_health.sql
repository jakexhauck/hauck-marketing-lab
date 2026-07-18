-- 0030: Business Health, the agency's own whole-business numbers.
--
-- This is Jake's agency data, not a client's, so the table is AGENCY-GLOBAL:
-- there is deliberately no tenant_id. One row per period, keyed by period_key:
--
--   month   -> "2026-07"
--   quarter -> "2026-Q3"
--   year    -> "2026"
--
-- period_key is UNIQUE so a period upserts exactly one row, which is what makes
-- a single-field autosave from the dashboard safe to fire repeatedly: the first
-- edit of an untouched period inserts, every later edit updates the same row.
-- A period nobody has saved simply has no row, and the API answers with an
-- all-zero template so the UI shows an honest empty period rather than
-- fabricated numbers.
--
-- Only the ten HAND-ENTERED inputs live here. The derived figures (CAC, ROAS,
-- Avg LTV, LTV:CAC, end client count) are NOT stored: they are pure functions of
-- these columns (src/lib/businessHealth.ts) and storing them would let a stale
-- copy drift away from the inputs it claims to summarise. Phase 1 is manual
-- entry; auto-fill from Meta/GHL is Phase 2 and will write these same columns.
--
-- Money is numeric (not integer cents) because every figure here is a
-- hand-entered round-ish dollar amount, and the percents need decimals too.
--
-- Run AFTER 0001..0029. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions, and /api/admin/* is
-- gated on session.adminId in functions/api/_middleware.ts, so no RLS policy is
-- needed for the API to work. RLS is still enabled with no policies so a stray
-- anon key can never read the agency's own P&L.

create table if not exists public.business_health (
  id                       uuid primary key default gen_random_uuid(),

  -- Period identity. The key IS the period; period_type drives the UI toggle.
  period_key               text not null unique,
  period_type              text not null,

  -- Manual inputs (Phase 1 hand entry).
  marketing_spend          numeric not null default 0,   -- feeds CAC and ROAS
  new_revenue              numeric not null default 0,   -- first-order revenue
  new_mrr                  numeric not null default 0,   -- recurring added
  start_clients            integer not null default 0,   -- active at period start
  new_clients              integer not null default 0,   -- signed this period
  churned_clients          integer not null default 0,   -- lost this period
  profit_margin_pct        numeric not null default 0,   -- after delivery cost, 0-100
  avg_retention_months     numeric not null default 0,   -- how long clients stay
  avg_revenue_per_client   numeric not null default 0,   -- avg monthly billing
  churn_pct                numeric not null default 0,   -- monthly logo churn, 0-100

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint business_health_period_type_check
    check (period_type in ('month', 'quarter', 'year'))
);

-- Listing every month (or every quarter) for a future trend view.
create index if not exists business_health_period_type_idx
  on public.business_health (period_type);

alter table public.business_health enable row level security;
