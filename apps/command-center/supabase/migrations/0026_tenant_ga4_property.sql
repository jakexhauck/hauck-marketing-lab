-- 0026: per-tenant Google Analytics 4 property id for the Website analytics tabs.
--
-- The Website Overview + Insights tabs read real visitor numbers from the GA4
-- Data API (functions/api/website/analytics.ts). The service-account KEY is a
-- single global agency secret (GA4_SA_JSON env), exactly like the Places key and
-- META_SYSTEM_USER_TOKEN. The PROPERTY is per-client: this column holds each
-- client's GA4 property id (a plain number, e.g. 544141225), exactly like
-- google_place_id scopes the Google place. That is why one client can never see
-- another's analytics.
--
-- Empty/null => the runtime falls back to the GA4_PROPERTY_ID env var (so a
-- single-tenant deploy still works), and if that is also unset the Website tabs
-- keep their honest not-connected empty state.
--
-- Run AFTER 0001-0025. Idempotent: safe to re-run.

alter table public.tenants
  add column if not exists ga4_property_id text;

-- Seed the launched client (Willis Windows). Only sets it when still null so a
-- re-run never clobbers a later admin edit.
update public.tenants
  set ga4_property_id = '544141225'
  where slug = 'willis-windows' and ga4_property_id is null;
