-- 0036: Cold SMS tracker (Acquisition > SMS): three tables behind one surface.
--
-- Agency-global: NO tenant_id. Jake's own outbound SMS numbers, hand-entered.
-- The app DB is the source of truth; no provider/GHL auto-fill in Phase 1.
--
--   cold_sms_daily        one row per calendar day, keyed by `day` (unique) so a
--                         single cell edit upserts without reading first. Feeds
--                         the shared DailyTracker engine.
--   cold_sms_monthly      one row per month of agency economics, keyed by
--                         `month` (unique, stored as first-of-month YYYY-MM-01).
--                         All-time, not month-scoped in the UI.
--   cold_sms_script_test  one row per A/B script variation, ordered by
--                         sort_order.
--
-- Every rate (reply %, show rate, CAC, ROI, booking %, ...) is COMPUTED in
-- src/lib/coldSms.ts and never stored: a stored derived value drifts from its
-- inputs. Money columns are numeric(12,2) dollars, matching how they are typed.
--
-- All count/money inputs are NULLABLE on purpose: a blank cell must round-trip
-- as blank, not as a fabricated 0.
--
-- Run AFTER 0001..0035. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.cold_sms_daily (
  id               uuid primary key default gen_random_uuid(),
  day              date not null unique,
  sms_sent         integer,
  positive_replies integer,
  meetings_booked  integer,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cold_sms_daily_day_idx
  on public.cold_sms_daily (day desc);

create table if not exists public.cold_sms_monthly (
  id             uuid primary key default gen_random_uuid(),
  -- First-of-month (YYYY-MM-01). Normalized server-side before every upsert.
  month          date not null unique,
  total_sms_sent integer,
  va_cost        numeric(12,2),
  calls_booked   integer,
  calls_showed   integer,
  sms_cost       numeric(12,2),
  new_clients    integer,
  cash_collected numeric(12,2),
  ltv            numeric(12,2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists cold_sms_monthly_month_idx
  on public.cold_sms_monthly (month desc);

create table if not exists public.cold_sms_script_test (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  total_sent       integer,
  positive_replies integer,
  calls_booked     integer,
  clients_closed   integer,
  -- Display order: a new variation takes (current max + 1).
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cold_sms_script_test_order_idx
  on public.cold_sms_script_test (sort_order asc, created_at asc);

alter table public.cold_sms_daily enable row level security;
alter table public.cold_sms_monthly enable row level security;
alter table public.cold_sms_script_test enable row level security;
-- No policies: service-role only.
