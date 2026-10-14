-- 0148: the client's contract, on Management's Contract rail.
--
-- The signed PDF goes in a PRIVATE bucket (contracts are not for strangers,
-- unlike followup-assets): the browser uploads on a signed upload URL, Claude
-- and Open PDF read it on short-lived signed URLs. Path is
-- <tenant_id>/<uuid>.pdf.
--
-- The terms live on client_billing (one row per client, admin-only) as their
-- own contract_* columns, owned by the rail's own endpoint so it and the
-- Billing cards never save over each other. Every term is nullable or blank:
-- a contract that does not say something leaves it empty rather than zero.
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-contracts', 'client-contracts', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

alter table public.client_billing
  add column if not exists contract_file_path     text not null default '',
  add column if not exists contract_file_name     text not null default '',
  add column if not exists contract_uploaded_at   timestamptz,
  add column if not exists contract_read_at       timestamptz,
  add column if not exists contract_length_months integer check (contract_length_months is null or contract_length_months between 0 and 600),
  add column if not exists contract_start         date,
  add column if not exists contract_end           date,
  add column if not exists contract_monthly_fee   integer check (contract_monthly_fee is null or contract_monthly_fee >= 0),
  add column if not exists contract_setup_fee     integer check (contract_setup_fee is null or contract_setup_fee >= 0),
  add column if not exists contract_payment       text not null default '',
  add column if not exists contract_notice_days   integer check (contract_notice_days is null or contract_notice_days between 0 and 3650),
  add column if not exists contract_auto_renew    text not null default '',
  add column if not exists contract_ad_spend      text not null default '',
  add column if not exists contract_guarantee     text not null default '',
  add column if not exists contract_clauses       jsonb not null default '[]'::jsonb;
