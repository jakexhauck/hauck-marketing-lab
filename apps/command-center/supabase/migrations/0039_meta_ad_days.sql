-- 0039: per-ad, per-day Meta spend snapshot for the rebuilt Ad Tracker.
--
-- Mirrors the Google Sheet's META DATA tab (columns A-E and I-N), which was
-- filled by the Make scenario "AC: (Local Ads School) Client Meta Data Feed".
-- One row per tenant per calendar day per ad.
--
-- Why store it rather than query Meta live:
--   * history survives an ad being deleted or an account being reconnected
--   * the dashboard renders without waiting on the Graph API
--   * Meta revises spend for days after the fact, so a trailing window is
--     refetched nightly and upserted over the top
--
-- The unique key is what makes that safe: (tenant_id, date, ad_id). The Make
-- scenario appended blindly, so a retry double-counted spend. Re-running the
-- sync here is a no-op.
--
-- adset_id is the reason this table earns its keep. GHL carries an ad id on the
-- contact but NO ad set id, so ad -> ad set -> campaign is resolved through
-- this snapshot, not through the CRM.
--
-- CTR, CPM and "day of week" are deliberately NOT stored. The sheet computed
-- them as formulas and so do we, at read time, so a formula change never needs
-- a backfill.
--
-- Money is numeric(12,2); counts are bigint (impressions outgrow int fast).
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts).
--
-- Run AFTER 0001..0038. Idempotent: safe to re-run.

create table if not exists public.meta_ad_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  date          date not null,
  ad_id         text not null,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  campaign_id   text,
  campaign_name text,
  spend         numeric(12,2) not null default 0,
  impressions   bigint        not null default 0,
  reach         bigint        not null default 0,
  link_clicks   bigint        not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, date, ad_id)
);

alter table public.meta_ad_days enable row level security;

-- Every read is "this tenant, this date range", so lead with both.
create index if not exists meta_ad_days_tenant_date_idx
  on public.meta_ad_days (tenant_id, date);

-- The breakdown groups by ad set and campaign within a tenant.
create index if not exists meta_ad_days_tenant_adset_idx
  on public.meta_ad_days (tenant_id, adset_id);
create index if not exists meta_ad_days_tenant_campaign_idx
  on public.meta_ad_days (tenant_id, campaign_id);
