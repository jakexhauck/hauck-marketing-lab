-- Willis Windows tenant seed.
-- Run AFTER 0001_init.sql.
-- Replace the placeholder values, then paste into Supabase SQL Editor → Run.

-- 1. Insert the tenant. Paste in GHL_TOKEN and GHL_LOCATION_ID from the section-01 credentials block.
insert into public.tenants (
  slug, name, niche,
  brand_color, brand_initials, app_name,
  won_label, value_label,
  ghl_location_id, ghl_token,
  monthly_spend
) values (
  'willis-windows',
  'Willis Windows',
  'Window Cleaning',
  '#1d6fb8',         -- deep window-glass blue; can be tweaked later via UPDATE
  'WW',
  'Willis Leads',
  'Booked & Paid',
  'Service Total',
  '__REPLACE_GHL_LOCATION_ID__',
  '__REPLACE_GHL_TOKEN__',
  1500              -- placeholder monthly ad spend; update later when real number is known
)
on conflict (slug) do update
  set name            = excluded.name,
      niche           = excluded.niche,
      brand_color     = excluded.brand_color,
      brand_initials  = excluded.brand_initials,
      app_name        = excluded.app_name,
      won_label       = excluded.won_label,
      value_label     = excluded.value_label,
      ghl_location_id = excluded.ghl_location_id,
      ghl_token       = excluded.ghl_token,
      monthly_spend   = excluded.monthly_spend;

-- 2. Link Jake as owner. Run this AFTER:
--    (a) you've created your auth user via Supabase Authentication → Users → "Add user", OR
--    (b) you've signed in once via magic link and your user row exists.
-- Replace the email below with the one you used.
insert into public.tenant_users (tenant_id, user_id, role)
select t.id, u.id, 'owner'
from public.tenants t
cross join auth.users u
where t.slug = 'willis-windows'
  and u.email = 'jdhauckmonetization@gmail.com'
on conflict do nothing;
