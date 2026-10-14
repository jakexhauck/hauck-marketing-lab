-- WILLIS WINDOWS — client seed. Run ONCE in the Supabase SQL Editor.
-- GHL creds stay 'env' on purpose; they come from Cloudflare env vars
-- (GHL_LOCATION_ID / GHL_TOKEN), NOT this table.
-- CONFIRM before running: brand_color, app_name, won_label.

-- 1. Insert the tenant row.
insert into public.tenants (
  slug, name, niche,
  brand_color, brand_initials, app_name,
  won_label, value_label,
  ghl_location_id, ghl_token,
  monthly_spend
) values (
  'willis-windows',           -- slug (must match TENANT_SLUG in Cloudflare)
  'Willis Windows',           -- display name
  'home-services',            -- niche
  '#1d6fb8',                  -- brand_color  <-- CONFIRM Willis's real brand hex
  'WW',                       -- initials
  'Willis Leads',             -- app_name     <-- CONFIRM (shows in app header)
  'Won',                      -- won_label    <-- CONFIRM (e.g. 'Job Booked')
  'Job Value',                -- value_label
  'env',                      -- GHL creds come from Cloudflare env vars
  'env',
  0                           -- monthly_spend (0 hides spend-derived stats)
)
on conflict (slug) do nothing;

-- 2. Optional: link an owner login (only if that email already exists in
--    Supabase Authentication > Users). Otherwise skip this block.
insert into public.tenant_users (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from public.tenants t
cross join auth.users u
where t.slug = 'willis-windows'
  and u.email = '__WILLIS_OWNER_EMAIL__'   -- <-- replace or delete this block
on conflict do nothing;
