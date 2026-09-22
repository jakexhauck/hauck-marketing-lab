-- One staff capability per client-app page (Jake, 2026-09-22).
--
-- The Team screen's "What they can access" list now reads exactly like the
-- sidebar. Four pages had no capability of their own and were open to every
-- employee: Ads Dashboard, Meta Data, Creatives and Organic. Lead Tracker had a
-- capability (paid_ads) but only its WRITE was checked, so every employee could
-- read it too.
--
-- 1. Every existing client gets the four new capabilities switched on, the same
--    way 0007 seeded the originals. New clients get them from clientCreate.ts,
--    which seeds the whole registry.
-- 2. Every existing employee keeps what they can open today: a view grant on
--    those five pages. Without this the deploy that starts checking them would
--    silently take pages away from people. Owners can switch them off after.
--
-- Idempotent: both inserts skip rows that already exist, so a re-run never
-- overwrites a grant an owner has since changed.

insert into public.tenant_entitlements (tenant_id, capability, enabled)
select t.id, c.capability, true
from public.tenants t
cross join (
  select unnest(array['ads_dashboard', 'meta_data', 'creatives', 'organic']) as capability
) c
on conflict (tenant_id, capability) do nothing;

insert into public.staff_permissions (staff_account_id, capability, can_view, can_edit)
select s.id, c.capability, true, false
from public.staff_accounts s
cross join (
  select unnest(array['paid_ads', 'ads_dashboard', 'meta_data', 'creatives', 'organic']) as capability
) c
on conflict (staff_account_id, capability) do nothing;
