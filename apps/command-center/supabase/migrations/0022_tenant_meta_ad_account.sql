-- 0022: per-tenant Meta (Facebook/Instagram) ad account id.
--
-- Paid Ads insights (functions/api/ads/insights.ts) used a single global
-- META_AD_ACCOUNT_ID env var, so every client would have shown the one live
-- client's ad numbers. This column scopes the ad account PER CLIENT, exactly
-- like ghl_location_id already does. The agency System-User token
-- (META_SYSTEM_USER_TOKEN) stays a single global env var: it legitimately spans
-- every client's ad account.
--
-- Empty/null => the runtime falls back to the META_AD_ACCOUNT_ID env var (so a
-- single-tenant deploy still works), and if that is also unset Paid Ads shows
-- its not-connected state.
--
-- Run AFTER 0001-0021. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists meta_ad_account_id text;
