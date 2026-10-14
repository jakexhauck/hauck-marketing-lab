-- 0088: the ad builder. Where an ad is WRITTEN, before anything is launched.
--
-- Everything Paid Ads holds today is a record of what already happened: the
-- Dashboard reads Meta's numbers, the Lead Tracker reads GHL's leads, Creatives
-- points at the finished files in Drive. None of it is where the work is done.
-- Writing the ads themselves has lived in a notes app, and a note is not a
-- place: it is not per client, nothing links a headline to the competitor whose
-- ad provoked it, and last month's round is unfindable by the time it is worth
-- looking at again.
--
-- So a BATCH: one sitting down and writing one round of ads for one client.
--
--   kind          static | video. The two are separate lists rather than one
--                 list with a filter, because they are written in different
--                 sittings and a video carries fields a static has no use for.
--
--   competitors   [{ name, url, notes }]. jsonb rather than a child table: it
--                 is only ever read as a whole batch, never queried across
--                 batches, and a join table for a list nobody aggregates is
--                 two files of plumbing bought with no read.
--
--   angles        ["..."]. Same reasoning.
--
--   copy_1..3 and headline_1..3 are COLUMNS, not an array, and there are
--   exactly three of each on purpose. The discipline is the feature: three
--   primaries and three headlines is what gets launched, and an array with an
--   Add button quietly becomes nine of each by March. A blank one is allowed,
--   a fourth one is not.
--
--   hook, script  video only, empty on every static row. Two nullable-in-spirit
--   columns beat a second table for two fields.
--
-- There is deliberately no status column. This table is a drafting table, not a
-- mirror of Meta: nothing here is live, paused or archived, and a status field
-- would be a second, hand-maintained account of what is running that the
-- Dashboard already answers from the source.
--
-- All text is PLAIN TEXT and is rendered as text. Nothing here reaches
-- dangerouslySetInnerHTML, so there is no sanitizer to keep in step; writes go
-- through the cleaners in functions/lib/adBatches.ts, which cap lengths and
-- flatten control characters other than the newlines a script needs.
--
-- Run AFTER 0001..0087. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts).

create table if not exists public.ad_batches (
  id          uuid primary key default gen_random_uuid(),

  -- Whose ads these are. Cascades: a deleted client takes its drafts with it.
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  kind        text not null check (kind in ('static', 'video')),

  -- What Jake calls this round. "Storm damage", "Energy bill". Allowed to be
  -- empty: a batch is created by pressing New and named while writing it, and
  -- refusing the row until it has a title would mean naming a thing before
  -- knowing what it is.
  name        text not null default '',

  competitors jsonb not null default '[]'::jsonb,
  angles      jsonb not null default '[]'::jsonb,

  copy_1      text not null default '',
  copy_2      text not null default '',
  copy_3      text not null default '',

  headline_1  text not null default '',
  headline_2  text not null default '',
  headline_3  text not null default '',

  -- Video only. The first three seconds, and the thing that gets read out.
  hook        text not null default '',
  script      text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The two reads that exist: one client's static list, one client's video list
-- (both newest first), and the Master page which is the same index without the
-- kind. Leading with tenant_id serves all three.
create index if not exists ad_batches_tenant_idx
  on public.ad_batches (tenant_id, kind, created_at desc);

alter table public.ad_batches enable row level security;
-- No policies: service-role only, same as sales_playbook_items. A client must
-- never reach this table. It holds competitor research and unlaunched copy,
-- and the client-facing app has no route that names it.
