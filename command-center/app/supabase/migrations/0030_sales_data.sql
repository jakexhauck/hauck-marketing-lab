-- 0030: Sales Data — the agency's own daily sales-call funnel.
--
-- One row per calendar day, typed by hand in the Sales pillar's Sales Data tab.
-- This is Jake's agency data, not a client's, so there is NO tenant_id: the
-- table is agency-global (see docs/build-plans/admin-redesign/_architecture.md,
-- "Agency-internal surfaces").
--
-- `day` is the whole identity. The endpoint upserts on it, so the unique
-- constraint below is load-bearing and not just hygiene: it is what makes two
-- edits to the same day collapse into one row instead of racing into two.
--
-- Only raw counts are stored. Every rate the page shows (show-up %, qualified %,
-- closing % overall, closing % from qualified) is derived at read time in
-- src/lib/salesTracker.ts, so a formula change never needs a backfill and a
-- stored rate can never drift from the counts it came from.
--
-- Money: cash_collected is numeric(12,2) dollars, matching how it is typed and
-- reported. (customer_jobs uses integer cents because it reconciles against
-- GHL's float monetaryValue; nothing here crosses that boundary.)
--
-- Run AFTER 0001..0029. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions behind the /api/admin/*
-- middleware gate, matching customer_jobs (0029): RLS is ON with NO policies, so
-- a stray anon key can never read the agency's own numbers.

create table if not exists public.sales_data (
  id                    uuid primary key default gen_random_uuid(),
  day                   date not null unique,
  calls_on_calendar     integer,
  rescheduled_cancelled integer,
  calls_taken           integer,
  qualified             integer,
  closed                integer,
  cash_collected        numeric(12,2),
  notes                 text,
  updated_at            timestamptz not null default now()
);

alter table public.sales_data enable row level security;

-- The page's only read: every row in a month window, in date order.
create index if not exists sales_data_day_idx on public.sales_data (day);
