-- 0143: lead forms go into Meta from the app (Paid Ads > Ad Builder > Lead Form).
--
-- tenants.meta_page_id   the client's Facebook Page the form is created on,
--                        picked from the Pages the agency system user can reach.
-- ad_lead_forms.meta_*   set once "Create in Meta" succeeds. Meta forms cannot
--                        be edited after creation, so a form with meta_form_id
--                        is read only here (the PATCH refuses it); Duplicate
--                        makes the next editable version.
--
-- Run AFTER 0001..0142. Idempotent.

alter table public.tenants add column if not exists meta_page_id text;

alter table public.ad_lead_forms add column if not exists meta_form_id text;
alter table public.ad_lead_forms add column if not exists meta_form_name text;
alter table public.ad_lead_forms add column if not exists meta_created_at timestamptz;
