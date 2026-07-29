-- Business Health (admin Command home). Agency-global manual metrics, one row
-- per period key. This is Jake's own agency data, so there is NO tenant_id and
-- no RLS: admin endpoints use the service-role client and are gated in
-- functions/api/_middleware.ts (/api/admin/* requires session.adminId).
--
-- Computed fields (CAC, ROAS, Avg LTV, LTV:CAC, End clients) are pure functions
-- of these inputs and are NOT stored here (they would drift); the client derives
-- them live. See src/lib/businessHealth.ts.

create table if not exists public.business_health (
  id                       uuid primary key default gen_random_uuid(),
  -- Period identity. period_key is unique so a period upserts one row:
  --   month   -> "2026-07"
  --   quarter -> "2026-Q3"
  --   year    -> "2026"
  period_key               text not null unique,
  period_type              text not null,
  -- Manual inputs (Phase 1 hand entry). numeric so percents/decimals are exact.
  marketing_spend          numeric not null default 0,   -- feeds CAC and ROAS
  new_revenue              numeric not null default 0,    -- first-order revenue
  new_mrr                  numeric not null default 0,    -- recurring added
  start_clients            integer not null default 0,    -- active at period start
  new_clients              integer not null default 0,    -- signed this period
  churned_clients          integer not null default 0,    -- lost this period
  profit_margin_pct        numeric not null default 0,    -- after delivery cost, 0-100
  avg_retention_months     numeric not null default 0,    -- how long clients stay
  avg_revenue_per_client   numeric not null default 0,    -- avg monthly billing
  churn_pct                numeric not null default 0,     -- monthly logo churn, 0-100
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint business_health_period_type_check
    check (period_type in ('month','quarter','year'))
);

create index if not exists business_health_period_type_idx
  on public.business_health (period_type);
