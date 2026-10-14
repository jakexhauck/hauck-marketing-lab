-- Proof that each client's stored Meta numbers match Meta.
--
-- meta_ad_days is a copy of Meta, and a copy drifts: a missed cron night left
-- two days of Willis spend unsynced (2026-09-22), and Meta restating a day
-- after the trailing window closed left another 27 cents off for good. Nothing
-- noticed either, because nothing ever compared the copy with the original.
--
-- After every sync the app now asks Meta for the account's own daily totals,
-- compares them day by day with what is stored, re-pulls any day that
-- disagrees, and records the verdict here: one row per client, overwritten on
-- every check. The admin cockpit reads it; a failed check also lands in
-- error_log, which the health probe already alarms on.
--
-- It also answers "has this client launched ads": synced_at is only ever set
-- for a client with an ad account, and first_spend_date only once Meta has
-- recorded real spend on it.
--
-- Additive and idempotent. Service role only.

create table if not exists public.meta_sync_status (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  synced_at        timestamptz,
  checked_at       timestamptz,
  ok               boolean not null default false,
  checked_since    date,
  checked_until    date,
  days_checked     integer not null default 0,
  stored_spend     numeric(12,2) not null default 0,
  meta_spend       numeric(12,2) not null default 0,
  stored_leads     integer not null default 0,
  meta_leads       integer not null default 0,
  repaired_days    integer not null default 0,
  first_spend_date date,
  mismatches       jsonb not null default '[]'::jsonb,
  error            text
);

alter table public.meta_sync_status enable row level security;

comment on table public.meta_sync_status is
  'Last Meta reconciliation per client: stored meta_ad_days vs Meta account totals, day by day. ok=false means a day still disagrees after a re-pull.';
