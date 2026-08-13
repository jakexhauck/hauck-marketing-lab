-- 0108: the Meta lead count the Paid Ads dashboard was never storing, and the
-- ad account timezone it was never cutting days in.
--
-- WHY. Willis Windows read "6 leads" on /marketing/paid-ads while Ads Manager
-- read 51 for the same 30 days. Three causes, two of which this migration is
-- the foundation for:
--
--   1. The dashboard's Leads figure counted GHL contacts sitting in lead-ish
--      pipelines. It has never touched Meta, and nothing filtered it by ad id,
--      so an organic caller counted as a paid lead.
--   2. meta_ad_days stored spend, impressions, reach and link clicks. It has
--      never stored a single conversion, so there was no Meta lead number in
--      the database to show even if the page had wanted one.
--   3. Day boundaries were computed with Date.UTC while Meta buckets every day
--      in the AD ACCOUNT's timezone. Willis runs on EST (fixed UTC-5), so we
--      were five hours out of step with every row Meta reports.
--
-- leads is the deduplicated `lead` roll-up for that ad on that day, computed by
-- functions/lib/metaActions.ts. Deliberately NOT Meta's own `results` field:
-- probed live on 2026-08-13, `results` is empty for all three of Willis's
-- Instant Form campaigns and populated only for the landing-page one, so
-- storing it would have reported 24 where Meta reports 51.
--
-- bigint, like the other counts, and default 0 so every historical row reads as
-- "no leads recorded" rather than null. The backfill re-syncs them with real
-- values immediately after this runs.
--
-- meta_timezone is the account's IANA (or Meta shorthand) zone, read from
-- /act_<id>?fields=timezone_name during the sync and cached on the tenant. It
-- changes approximately never, and a date range cut in the wrong zone is the
-- quietest way left for this page to disagree with Ads Manager.
--
-- Run AFTER 0001..0107. Idempotent: safe to re-run.

alter table public.meta_ad_days
  add column if not exists leads bigint not null default 0;

alter table public.tenants
  add column if not exists meta_timezone text;

comment on column public.meta_ad_days.leads is
  'Deduplicated Meta `lead` action roll-up for this ad on this day. See functions/lib/metaActions.ts; not Meta''s `results` field, which is empty for Instant Form campaigns.';

comment on column public.tenants.meta_timezone is
  'The ad account''s reporting timezone from Meta (timezone_name). Date ranges on the Paid Ads dashboard are cut in this zone so the buckets match Ads Manager.';
