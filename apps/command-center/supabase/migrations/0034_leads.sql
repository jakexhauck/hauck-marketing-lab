-- 0034: Leads: Jake's agency-internal manual lead book (Acquisition > Leads).
--
-- Agency-global: NO tenant_id. This is the agency's own prospect list, hand-kept
-- in the admin console, distinct from per-client GHL opportunities (those come
-- from GoHighLevel via /api/leads and never touch this table). Phase 1 is manual
-- entry; the app DB is the source of truth.
--
-- Run AFTER 0001..0033. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies),
-- matching admin_tasks / admin_audit_log.

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  first_name          text not null default '',
  last_name           text not null default '',
  phone               text not null default '',
  timezone            text not null default '',
  status              text not null default 'New'
                        check (status in ('New','Contacted','No Answer',
                                          'Booked','Qualified','Closed','Dead')),
  first_contact_date  date,
  source              text not null default '',
  appointment_date    date,
  no_answer           integer not null default 0,
  last_contact        date,
  follow_up_date      date,
  email               text not null default '',
  notes               text not null default '',
  -- Who added the row (best-effort provenance). Null if that admin is removed.
  admin_id            uuid references public.admin_accounts(id) on delete set null,
  -- Soft delete: non-null hides the row from every list. Never hard-deleted here.
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Live-list ordering: newest first, deleted rows excluded by the query.
create index if not exists leads_listing_idx
  on public.leads (created_at desc);

-- Fast status-count tiles + status filtering.
create index if not exists leads_status_idx
  on public.leads (status);

alter table public.leads enable row level security;
-- No policies: service-role only, same as admin_tasks.
