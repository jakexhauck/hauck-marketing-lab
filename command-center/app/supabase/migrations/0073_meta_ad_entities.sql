-- 0073: the campaign / ad set / ad structure behind the Paid Ads breakdown,
-- with each one's live status.
--
-- meta_ad_days (0039) already carries every id and name, so why a second table:
--
--   1. It only knows about SPEND. An ad that exists but has never run has no
--      row, so the breakdown could not list a client's full creative set.
--   2. It has no status. A day row cannot carry one honestly: status is a
--      property of the entity now, not of that Tuesday.
--
-- Jake's rule for the client-facing breakdown (2026-07-30): show the ads in the
-- campaign that is currently live, with the ones actually running marked and
-- sorted to the top. Both halves of that need this table.
--
-- One row per entity per tenant, keyed (tenant_id, entity_id). Refreshed whole
-- by the same sync that fills meta_ad_days: rows Meta no longer returns are
-- deleted, because a deleted campaign lingering here would keep filtering the
-- page toward a campaign that no longer exists.
--
-- `status` is Meta's effective_status verbatim (ACTIVE, PAUSED, CAMPAIGN_PAUSED,
-- ADSET_PAUSED, ARCHIVED, ...). Stored raw rather than as a boolean so the
-- meaning of "live" can change in code without a backfill.
--
-- Run AFTER 0001..0072. Idempotent: safe to re-run.

create table if not exists public.meta_ad_entities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- 'campaign' | 'adset' | 'ad'. Matches the breakdown's three levels.
  level       text not null,
  entity_id   text not null,
  name        text,
  status      text,
  -- The campaign this entity belongs to. For a campaign row this equals
  -- entity_id, which is what lets one filter cover all three levels.
  campaign_id text,
  -- Null on campaign rows.
  adset_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, entity_id)
);

alter table public.meta_ad_entities enable row level security;

-- Every read is "this tenant, this level".
create index if not exists meta_ad_entities_tenant_level_idx
  on public.meta_ad_entities (tenant_id, level);

-- And then "which of these belong to the live campaign".
create index if not exists meta_ad_entities_tenant_campaign_idx
  on public.meta_ad_entities (tenant_id, campaign_id);
