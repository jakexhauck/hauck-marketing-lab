-- 0040: setter_dials, one row per phone dial for the Setter Suite.
--
-- Every per-lead field the Setter board shows (attempt count, first call time,
-- whether anyone was reached, latest outcome) and every headline rate is
-- DERIVED from this table by functions/lib/setterMetrics.ts, never stored
-- redundantly. Append-only by design so history is never lost: a dial is a
-- fact that already happened and is never edited or deleted after the fact.
--
-- tenant_id scopes a dial to the client whose leads were being worked, same
-- pattern as meta_ad_days. contact_id/opportunity_id are GHL ids (text, not
-- uuid) matching how the rest of this codebase references GHL records.
--
-- outcome is constrained to the fixed set the setter UI offers; a raw text
-- column with a check constraint keeps it simple to query while still
-- rejecting typos at write time.
--
-- Run AFTER 0001..0039. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated
-- in _middleware.ts).

create table if not exists public.setter_dials (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  contact_id     text not null,
  opportunity_id text,
  pipeline_name  text,
  stage_name     text,
  dialed_at      timestamptz not null default now(),
  spoke          boolean not null default false,
  outcome        text not null check (outcome in
                   ('booked','not_interested','no_answer','reschedule','bad_lead')),
  note           text,
  tags_applied   jsonb not null default '[]'::jsonb,
  created_by     uuid references public.admin_accounts(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.setter_dials enable row level security;
-- No policies: service-role only.

-- The board and cockpit both query by tenant then contact.
create index if not exists setter_dials_tenant_contact_idx
  on public.setter_dials (tenant_id, contact_id, dialed_at desc);

-- The metrics roll-up scans a tenant over a date range.
create index if not exists setter_dials_tenant_dialed_idx
  on public.setter_dials (tenant_id, dialed_at desc);
