-- 0022: per-customer recurring schedule (app-owned).
-- One row per (tenant, GHL contact) describing a weekly / every-N-weeks visit
-- anchored to a weekday. The Customers tab edits this; useJobs generates the
-- upcoming visits onto the Jobs calendar. Reached only via the service-role
-- client in Functions (same convention as tour_progress, 0019). Idempotent.

create table if not exists public.customer_recurrence (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  contact_id    text not null,             -- GHL contact id (the customer)
  cadence_weeks int  not null default 1,   -- 1 weekly, 2 biweekly, 4 monthly-ish
  weekday       int  not null,             -- 0 Sunday .. 6 Saturday
  anchor_date   date not null,             -- interval reference; lands on weekday
  visit_time    text,                      -- display time e.g. "9:00 AM"
  service       text,
  price_cents   int,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, contact_id)
);

create index if not exists customer_recurrence_tenant_idx
  on public.customer_recurrence (tenant_id);
