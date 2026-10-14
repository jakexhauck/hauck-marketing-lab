-- 0023: per-tenant Google Places place_id for the Reviews rating hero.
--
-- The Reviews Overview rating hero + recent-reviews teaser read Google's public
-- rating via the Places API (functions/api/reviews/summary.ts). The Places API
-- KEY is a single global agency secret (GOOGLE_PLACES_API_KEY env), exactly like
-- META_SYSTEM_USER_TOKEN. The PLACE is per-client: this column holds each
-- client's Google place_id, exactly like meta_ad_account_id scopes the ad
-- account. That is why one client can never see another's reviews.
--
-- Empty/null => the runtime falls back to the GOOGLE_PLACE_ID env var (so a
-- single-tenant deploy still works), and if that is also unset the Reviews hero
-- shows its not-connected state.
--
-- Run AFTER 0001-0022. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists google_place_id text;
