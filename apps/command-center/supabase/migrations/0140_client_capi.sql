-- 0140: client_capi, each client's Meta Conversions API values.
--
-- Client Setup SOP, CAPI Setup: "Copy Dataset ID -> Paste in Google Doc",
-- "Copy Access Token -> Paste in Google Doc". This table is that Google Doc.
-- The dataset itself is still made by hand in Meta (Jake, 2026-10-06).
--
-- access_token is a live Meta token. Service role only (RLS on, no policies),
-- returned only to an owner admin session, masked unless revealed, and every
-- reveal and save goes to admin_audit_log (functions/api/admin/clients/[tenantId]/capi).
--
-- Run AFTER 0001..0139. Idempotent: safe to re-run.

create table if not exists public.client_capi (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  dataset_id   text not null default '',
  access_token text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.admin_accounts(id) on delete set null
);

alter table public.client_capi enable row level security;

comment on table public.client_capi is
  'Per-client Meta CAPI Dataset ID + access token (Client Setup SOP). Service role only; owner admin reads, masked by default.';
