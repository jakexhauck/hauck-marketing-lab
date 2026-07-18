-- 0037: per-client billing record (admin Fulfillment cockpit > Billing tab).
--
-- One row per tenant (1:1, tenant_id unique). Phase 1 is manual entry: the admin
-- types the deal + cash + dates + status here and this table is the source of
-- truth. Kept OFF the tenants row (which is read on every request) because these
-- are admin-only CRM fields with a single writer. Dates are stored as free text
-- in Phase 1 (typed exactly as the deal notes read); cash amounts are integers
-- (whole dollars). Reached only via the service-role client in Functions.
--
-- Run AFTER 0001..0036. Idempotent: safe to re-run (this table was first applied
-- under the number 0033, which Operations then took; the re-run is a no-op).

create table if not exists public.client_billing (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null unique references public.tenants (id) on delete cascade,
  source                text not null default '',        -- Cold Call / Referral / Inbound Form / Facebook Ad / SMS / ...
  date_closed           text not null default '',        -- free text, e.g. "Jun 12, 2026"
  service               text not null default '',
  payment_arrangement   text not null default '',
  upfront_cash          integer not null default 0,      -- whole dollars
  remaining_cash        integer not null default 0,
  total_cash_collected  integer not null default 0,
  billing_date          text not null default '',        -- free text
  renewal_date          text not null default '',
  last_touchpoint       text not null default '',
  churn_date            text not null default '',
  status                text not null default 'active' check (status in ('active','churned')),
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- tenant_id is already unique, which is the only lookup path, so no extra index.
alter table public.client_billing enable row level security;
