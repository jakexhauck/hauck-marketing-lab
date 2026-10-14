-- 0061: SOPs join the cold caller's shelf (Acquisition > Cold Call).
--
-- A third `kind` on cold_call_assets rather than a table of its own.
--
-- An SOP is the same shape as everything already in that table: an owner-written
-- document with a name, a heading, sanitized html, an order and an archive flag.
-- The only thing that differs is when it is read, and "when someone reads it" is
-- not a schema difference. A parallel table would have duplicated the sanitizer,
-- the ordering, the archive rules and the endpoint for no gain.
--
-- Deliberately NOT built on the existing SOP Hub (functions/api/admin/sops):
-- that one reads live from Google Drive, and Drive has never been connected on
-- this install, so anything depending on it would ship unable to work.
--
-- kind now means:
--   'script' a variation of the pitch, and the unit of the A/B test.
--   'asset'  something reached for MID-call, read in the floating panel.
--   'sop'    how the job is done, read BEFORE and BETWEEN calls, on its own page.
--
-- Run AFTER 0001..0060. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

-- Postgres has no "alter check constraint", so the old one is dropped and
-- replaced. Named explicitly rather than relying on the generated name, which
-- differs depending on how the table was first created.
alter table public.cold_call_assets
  drop constraint if exists cold_call_assets_kind_check;

alter table public.cold_call_assets
  add constraint cold_call_assets_kind_check
  check (kind in ('script', 'asset', 'sop'));

-- The SOPs page reads "the live ones, in Jake's order", the same shape of read
-- the mid-call shelf makes, so it gets the same partial index.
create index if not exists cold_call_assets_sop_idx
  on public.cold_call_assets (category, sort_order)
  where kind = 'sop' and archived_at is null;

comment on column public.cold_call_assets.kind is
  'script = a pitch variation and the unit of the A/B test. asset = read mid-call in the floating panel. sop = how the job is done, read before and between calls on its own page.';
