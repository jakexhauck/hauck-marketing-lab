-- 0038: per-client daily paid-ad funnel tracker
-- (admin Fulfillment cockpit > Paid Ads > Ad Tracking).
--
-- One row per tenant per calendar day. Phase 1 is manual entry: the admin types
-- the 13 raw inputs and this table is the source of truth. Every ratio the UI
-- shows (CPM, CPC, CTR, CPL, CPNL, LP Conv, Cost/Demo, Lead->Book, Qual %,
-- Cost/Qual, CPA, Rev ROAS, UF ROAS) is DERIVED in the client lib and is never
-- stored, so a formula change never needs a backfill.
--
-- Money is numeric(12,2); counts are integers. Reached only via the service-role
-- client in Functions (admin session gated in _middleware.ts).
--
-- Run AFTER 0001..0037. Idempotent: safe to re-run (this table was first applied
-- under the number 0034, which Acquisition then took; the re-run is a no-op).

create table if not exists public.ad_tracking_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  date          date not null,

  -- Spend band inputs
  spend           numeric(12,2) not null default 0,
  impressions     integer       not null default 0,
  clicks          integer       not null default 0,
  link_clicks     integer       not null default 0,

  -- Funnel band inputs
  new_leads       integer       not null default 0,
  demos_booked    integer       not null default 0,

  -- Qualify band inputs
  qualified       integer       not null default 0,
  disqualified    integer       not null default 0,
  no_show         integer       not null default 0,

  -- Revenue band inputs
  sales           integer       not null default 0,
  contracted_rev  numeric(12,2) not null default 0,
  uf_cash         numeric(12,2) not null default 0,
  new_mrr         numeric(12,2) not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One row per client per day: the upsert conflict target.
  unique (tenant_id, date)
);

-- The only read path is "this tenant's rows for one month", which the unique
-- constraint's index already serves (tenant_id first, then date).

alter table public.ad_tracking_days enable row level security;
