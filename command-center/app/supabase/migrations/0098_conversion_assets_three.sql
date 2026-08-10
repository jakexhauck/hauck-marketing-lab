-- 0098: the three conversion assets settle on their final shape.
--
--   recent-work        new lead, text 1    proof, before they have met you
--   owner-story        new lead, text 2    who they are hiring, plus the gift
--   unique-mechanism   estimate reminder   their process, named
--
-- Two changes from 0096, both driven by what the universal texts actually say:
--
-- 1. 'recent-job' and 'our-work' were one page all along. The single-job page
--    and the wall-of-proof page had the same job, so they merge into
--    'recent-work' and it keeps the whole proof stack.
--
-- 2. The owner-story text promises a GIFT on the website. A page that does not
--    hand it over is a broken promise, so the coupon is a first-class field
--    rather than something remembered at build time.
--
-- 'unique-mechanism' replaces the freed slot. It rides along with the estimate
-- REMINDERS, so its reader already has an appointment and it books nothing.
-- It is also the one page built almost entirely out of positioning: the client
-- may have no photos and no documented process, so every field here is optional
-- and blank means "invent it".
--
-- Run AFTER 0096. Idempotent.

alter table public.followup_pages
  -- The gift the owner-story text promised. Stored per client because a client
  -- may set their own discount, defaulted in code to what the message says.
  add column if not exists coupon_offer    text not null default '',
  add column if not exists coupon_code     text not null default '',
  add column if not exists coupon_terms    text not null default '',

  -- The named mechanism and the notes that steer it. Blank name means the
  -- builder invents one.
  add column if not exists mechanism_name  text not null default '',
  add column if not exists mechanism_notes text not null default '';

-- The merge. our-work FIRST, because it is the shape recent-work inherits, and
-- doing it in this order means a tenant holding both ends up with the fuller
-- page rather than the thinner one.
update public.followup_pages
   set asset_kind = 'recent-work'
 where asset_kind = 'our-work';

-- Then the single-job rows, but only where that tenant has not already got a
-- recent-work row. Without the guard this trips the (tenant_id, asset_kind)
-- unique index and takes the whole statement down.
update public.followup_pages p
   set asset_kind = 'recent-work'
 where p.asset_kind = 'recent-job'
   and not exists (
     select 1
       from public.followup_pages q
      where q.tenant_id = p.tenant_id
        and q.asset_kind = 'recent-work'
   );

-- Anything still calling itself recent-job lost the merge to a sibling. It
-- keeps its data and shows up under "Older pages" to be dealt with by hand,
-- rather than being deleted by a migration nobody watched run.
update public.followup_pages
   set asset_kind = ''
 where asset_kind = 'recent-job';

comment on table public.followup_pages is
  'Conversion assets: the intake for the conversion-asset skill plus the built '
  'page body. Three fixed assets per client (recent-work, owner-story, '
  'unique-mechanism), one row each. The table name is historical.';
