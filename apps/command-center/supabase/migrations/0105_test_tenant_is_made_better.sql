-- 0105: the test account and Made Better Landscaping Co are one account.
--
-- On 2026-08-09 the sub-account behind the old test tenant (GHL location
-- r0WfsA12qpBv7M185V3v) stopped being an internal scratch account and became
-- Made Better Landscaping Co's own. It holds a real client's data now.
--
-- That left the database describing one account as two tenants:
--
--   test-account                 name 'Test Account', ghl_location_id 'pending'
--                                (empty: 0 tenant_users, 0 staff_accounts,
--                                 0 push_subscriptions, 3 activity_log rows)
--                                yet the shared-password login scoped to it
--                                while reading GHL data from the location below
--
--   made-better-landscaping-co   the real client row, holding the real
--                                ghl_location_id and the real staff account
--
-- This migration collapses them onto the real row. The code change that goes
-- with it is DEFAULT_TEST_SLUG in functions/lib/env.ts, which now resolves the
-- shared-password session to 'made-better-landscaping-co'.
--
-- Nothing is deleted. The old row is kept, renamed so it cannot be mistaken for
-- a live tenant, so this is reversible.

-- 1. Move the stray rows off the old tenant onto the real one.
-- Only activity_log has any (3 rows, June 2026 webhook verification pings for
-- contact 'verify-test'). The others are written defensively in case this runs
-- against a database where the old tenant did accumulate rows.
update public.activity_log
set tenant_id = (select id from public.tenants where slug = 'made-better-landscaping-co')
where tenant_id = (select id from public.tenants where slug = 'test-account')
  and exists (select 1 from public.tenants where slug = 'made-better-landscaping-co');

update public.tenant_users
set tenant_id = (select id from public.tenants where slug = 'made-better-landscaping-co')
where tenant_id = (select id from public.tenants where slug = 'test-account')
  and exists (select 1 from public.tenants where slug = 'made-better-landscaping-co');

update public.push_subscriptions
set tenant_id = (select id from public.tenants where slug = 'made-better-landscaping-co')
where tenant_id = (select id from public.tenants where slug = 'test-account')
  and exists (select 1 from public.tenants where slug = 'made-better-landscaping-co');

-- staff_accounts carries a globally-unique email (migration 0010), so moving a
-- row could collide with an account already on the real tenant. Move only the
-- ones whose email is not already there.
update public.staff_accounts s
set tenant_id = (select id from public.tenants where slug = 'made-better-landscaping-co')
where s.tenant_id = (select id from public.tenants where slug = 'test-account')
  and exists (select 1 from public.tenants where slug = 'made-better-landscaping-co')
  and not exists (
    select 1 from public.staff_accounts other
    where other.email = s.email
      and other.tenant_id = (select id from public.tenants where slug = 'made-better-landscaping-co')
  );

-- 2. Retire the old row. Renamed, not dropped: if anything unknown still points
-- at this tenant id, it keeps resolving rather than failing on a missing row,
-- and the name says plainly what happened.
update public.tenants
set
  name = 'RETIRED 2026-08-09 - merged into Made Better Landscaping Co',
  app_name = 'Retired',
  brand_initials = 'XX'
where slug = 'test-account';
