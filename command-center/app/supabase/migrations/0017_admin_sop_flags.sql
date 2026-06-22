-- 0017: SOP triage flags (the admin SOP Hub checkboxes).
--
-- A shared, lightweight triage list: each row marks one SOP (by its category
-- key + slug from lib/sopData.ts) as "consider for an SOP checklist". The admin
-- ticks boxes in the SOP Hub; a ticked box inserts a row, unticking deletes it.
-- Presence of a row == considered. Flags are shared across admins (effectively
-- one operator today), not per-admin.
--
-- The category key / slug are app-level identifiers from the static SOP seed,
-- not foreign keys, so no references here.
--
-- Run AFTER 0001..0016. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.admin_sop_flags (
  cat_key    text not null,
  slug       text not null,
  considered boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (cat_key, slug)
);

alter table public.admin_sop_flags enable row level security;
-- No policies: service-role only, same as admin_tasks/admin_accounts.
