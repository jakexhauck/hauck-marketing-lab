-- 0151: Client Tracker answers for a deal closed before the client exists.
--
-- Saving a Sales Data form as PIF or Deposit asks for the Client Tracker row
-- there and then. The client has no tenant yet (one is made when their intake
-- is approved), so the answers wait here, one row per closed meeting, and the
-- Clients sheet draws them below the real clients. Intake approval matches the
-- new tenant to its row (email, phone, then business name), copies the answers
-- into client_billing and stamps tenant_id. An unmatched row is linked by hand
-- from the sheet, which does the same.
--
-- The tracker columns mirror client_billing exactly so the copy is one spread.
-- email / phone / business_name are copied off the meeting at save time and are
-- only what the match reads.
--
-- Idempotent.

create table if not exists public.pending_clients (
  id                    uuid primary key default gen_random_uuid(),
  sales_call_id         uuid not null unique references public.sales_calls (id) on delete cascade,
  -- Set once the answers have moved onto a real client. A linked row is kept
  -- (not deleted) so the meeting still reads as "tracker done".
  tenant_id             uuid references public.tenants (id) on delete set null,
  business_name         text not null default '',
  email                 text not null default '',
  phone                 text not null default '',
  first_name            text not null default '',
  last_name             text not null default '',
  source                text not null default '',
  date_closed           text not null default '',
  service               text not null default '',
  payment_arrangement   text not null default '',
  upfront_cash          integer not null default 0,
  remaining_cash        integer not null default 0,
  total_cash_collected  integer not null default 0,
  billing_date          text not null default '',
  renewal_date          text not null default '',
  last_touchpoint       text not null default '',
  churn_date            text not null default '',
  status                text not null default 'active' check (status in ('active','churned')),
  notes                 text not null default '',
  ad_tracking_sheet     text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists pending_clients_unlinked_idx
  on public.pending_clients (created_at) where tenant_id is null;

alter table public.pending_clients enable row level security;
