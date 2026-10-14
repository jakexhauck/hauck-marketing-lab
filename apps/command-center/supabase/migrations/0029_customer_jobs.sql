-- 0029: Customer job history — the work a customer has actually paid for.
--
-- GoHighLevel owns WHO is a customer: one opportunity per contact in the client's
-- "Customers" pipeline, whose stage IS their type (One-Time / Recurring). What
-- GHL cannot hold is the WORK, because an opportunity carries a single
-- monetaryValue and a recurring customer has many jobs. So:
--
--   customer_jobs           one row per job done for a contact (what it was, what
--                           it was worth, when it finished). The Customers page
--                           sums these per contact and per stage for its counts
--                           and revenue tiles. Money is integer CENTS; GHL's
--                           monetaryValue is float dollars, converted at the
--                           boundary.
--
--   customer_service_plan   at most one row per contact: when they are next due.
--                           status distinguishes the three real cases, which a
--                           nullable date alone cannot:
--                             booked    - next_service_at is real and
--                                         ghl_appointment_id points at the GHL
--                                         appointment backing it
--                             unplanned - recurring, date not known yet. The page
--                                         shows amber until someone books it.
--                             none      - recurring, nothing due. No amber, no nag.
--
-- source_opportunity_id is the Sales opportunity a job was closed out from, and
-- doubles as the close-out ledger: a job needs closing out when its opportunity
-- sits in "Job Completed" AND its id is absent here. That rule holds for both
-- close-out paths (a first-time customer's opportunity MOVES out of the stage; a
-- repeat customer's incoming opportunity is parked in it), which is why the
-- partial unique index below is load-bearing and not just hygiene: it is also the
-- double-submit guard when two staff close out the same job at once. Jobs added
-- by hand from the customer page (backfill, or recovery from a half-failed
-- close-out) carry NULL here, and the index's WHERE clause lets them coexist.
--
-- Run AFTER 0001..0028. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions, matching
-- website_change_requests (0024): RLS is ON with NO policies, so a stray anon key
-- can never read another tenant's revenue.

create table if not exists public.customer_jobs (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  ghl_contact_id        text not null,
  description           text not null,
  value_cents           integer not null default 0,
  completed_on          date not null,
  source_opportunity_id text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.customer_jobs enable row level security;

-- The close-out ledger + the double-submit guard. Partial, so hand-added jobs
-- (source_opportunity_id null) are never in conflict with each other.
create unique index if not exists customer_jobs_source_opp_uidx
  on public.customer_jobs (tenant_id, source_opportunity_id)
  where source_opportunity_id is not null;

-- The page's read: every job for a contact, newest first.
create index if not exists customer_jobs_tenant_contact_idx
  on public.customer_jobs (tenant_id, ghl_contact_id, completed_on desc);

create table if not exists public.customer_service_plan (
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  ghl_contact_id     text not null,
  next_service_at    timestamptz,
  status             text not null default 'unplanned',
  ghl_appointment_id text,
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, ghl_contact_id),
  constraint customer_service_plan_status_chk
    check (status in ('booked', 'unplanned', 'none'))
);

alter table public.customer_service_plan enable row level security;
