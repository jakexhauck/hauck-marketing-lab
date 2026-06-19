-- CLIENT SEED TEMPLATE. Not a migration; never run as-is.
-- At client onboarding time: copy this file, replace every __PLACEHOLDER__,
-- then run it once in the Supabase SQL Editor. Also set TENANT_SLUG in
-- Cloudflare to the same slug so live sessions resolve this tenant.
--
-- Requires 0001_init.sql (tenants/tenant_users tables).

-- 1. Insert the tenant row.
insert into public.tenants (
  slug, name, niche,
  brand_color, brand_initials, app_name,
  won_label, value_label,
  ghl_location_id, ghl_token,
  monthly_spend
) values (
  '__CLIENT_SLUG__',          -- e.g. 'acme-roofing'; lowercase, hyphens
  '__CLIENT_NAME__',          -- e.g. 'Acme Roofing'
  '__NICHE__',                -- e.g. 'home-services'
  '__BRAND_HEX__',            -- e.g. '#1d6fb8'
  '__INITIALS__',             -- e.g. 'AR'
  '__APP_NAME__',             -- e.g. 'Acme Leads'
  '__WON_LABEL__',            -- e.g. 'Booked & Paid'
  '__VALUE_LABEL__',          -- e.g. 'Job Value'
  'env',                      -- GHL creds come from Cloudflare env vars, not this table
  'env',
  0                           -- real monthly ad spend, or 0 to hide spend-derived stats
)
-- DO NOTHING on purpose: a re-run must never clobber an existing tenant's row
-- with placeholders. Update an existing tenant with an explicit UPDATE instead.
on conflict (slug) do nothing;

-- 2. Optional: link an agency auth user as owner (only if that user exists in
-- Supabase Authentication > Users).
insert into public.tenant_users (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from public.tenants t
cross join auth.users u
where t.slug = '__CLIENT_SLUG__'
  and u.email = '__OWNER_EMAIL__'
on conflict do nothing;
