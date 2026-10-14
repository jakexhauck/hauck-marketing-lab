-- 0096: follow-up pages become conversion assets.
--
-- Three fixed assets per client instead of an open library of pages:
--
--   owner-story   new lead, text 1   who they are hiring       books
--   recent-job    new lead, text 2   one job, start to finish  books
--   our-work      estimate booked    proof before the visit    asks for nothing
--
-- The follow-up SMS is universal now: one set of messages, written once, living
-- in GHL, sent to every client's leads. So sms_body, page_type, followup_type,
-- step and media_treatment no longer describe anything the operator decides.
--
-- NOTHING IS DROPPED. Those five columns hold one empty draft row between them,
-- so dropping them buys a tidier table in exchange for a one-way change to a
-- live database. They stop being written and stop being selected, which is the
-- part that actually matters. If they are still dead in a month, drop them then.
--
-- Run AFTER 0095. Idempotent.

alter table public.followup_pages
  -- 'owner-story' | 'recent-job' | 'our-work'. Free text, checked in the shared
  -- lib rather than by a constraint, so a fourth kind is a code change and not
  -- a migration. '' is a row written before this migration.
  add column if not exists asset_kind      text  not null default '',

  -- The owner story asks for a photo and for notes to steer the writing. The
  -- finished prose is NOT stored: the skill writes it at build time, so what
  -- lives here is the raw material, not the output.
  add column if not exists owner_name      text  not null default '',
  add column if not exists owner_photo_url text  not null default '',
  add column if not exists story_notes     text  not null default '',

  -- [{ before, after, caption }]. One for recent-job, up to five for our-work.
  -- A job is a PAIR: two unlabelled photos is how a slider ends up cropping the
  -- wrong way round with nothing downstream able to tell which was which.
  add column if not exists jobs            jsonb not null default '[]'::jsonb,

  -- [{ text, name, stars }], typed in by hand. Deliberately not pulled from
  -- Google: that integration is still waiting on approval, and an asset that
  -- cannot ship until it lands is an asset that does not ship.
  add column if not exists reviews         jsonb not null default '[]'::jsonb,

  -- The fixed six: licensed, insured, years, jobsCompleted, warranty,
  -- serviceArea. Same questions for every client, so a thin page is visibly
  -- thin rather than differently shaped.
  add column if not exists trust           jsonb not null default '{}'::jsonb;

-- The two page types that survived the change keep their rows. Every other
-- page_type described an angle that no longer exists, and guessing which of the
-- three it should become would put a page in a slot nobody chose.
update public.followup_pages
   set asset_kind = page_type
 where asset_kind = ''
   and page_type in ('owner-story', 'recent-job');

-- ONE ROW PER SLOT. This is the guarantee that replaces the old step cap: a
-- client has exactly one owner story, and a second is not a version of the
-- first, it is a duplicate that would fight it for the same fixed path.
--
-- Partial, so the rows written before this migration do not collide with each
-- other on the empty string.
create unique index if not exists followup_pages_tenant_kind_idx
  on public.followup_pages (tenant_id, asset_kind)
  where asset_kind <> '';

comment on table public.followup_pages is
  'Conversion assets: the intake for the conversion-asset skill plus the built '
  'page body. Three fixed assets per client (owner-story, recent-job, '
  'our-work), one row each. The table name is historical.';
