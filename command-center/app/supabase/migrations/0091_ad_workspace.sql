-- 0091: one living ad workspace per client. Replaces the batch.
--
-- 0088 modelled the work as ROUNDS: a batch was one sitting down and writing one
-- round of ads, static or video, named, and kept forever so last month's was
-- findable. That was a guess about how the work is organised, and it was wrong.
-- In practice there is the copy that is CURRENT and the ads that are RUNNING,
-- and picking which round you meant before you can edit a headline is friction
-- paid on every single edit to buy a lookback that almost never happens.
--
-- So: one row per client, and three pages over it.
--
--   Copy & Angles   competitors, angles, copy_1..3, headline_1..3
--   Ads             the ads jsonb below
--   Lead Form       ad_lead_forms (0090), unchanged and already per client
--
-- WHAT WENT AWAY, and it is worth being explicit because 0088 and 0089 argued
-- for all of it two days ago:
--
--   the round        no name, no list, no picking one first
--   static/video     "video" is now just an ad TYPE beside "before and after".
--                    A batch no longer has a kind.
--   hook, script     they only existed because a video BATCH existed. An ad
--                    whose type says video has a creative; the words that get
--                    read out live with the video, not in the app.
--   Master           it was the two batch lists read back. With one flat set
--                    there is nothing to read back: the pages ARE the record.
--
-- WHAT SURVIVED, unchanged and on purpose:
--
--   three primaries and three headlines, still exactly three, still shared
--   across every ad. The discipline is the feature.
--   competitors and angles, because they are what the copy is written FROM.
--
-- THE COST, accepted knowingly: there is no history. Overwriting last month's
-- primary copy loses it. The fix if that ever bites is a snapshot table, not a
-- return to rounds.
--
-- tenant_id is the PRIMARY KEY, not just a foreign key. That is what makes
-- "one per client" true in the database rather than true by convention, and it
-- makes the write a plain upsert with nothing to look up first.
--
-- ad_batches is deliberately NOT dropped here. Its code is live in production
-- right now, and a migration runs BEFORE the deploy that replaces it, so
-- dropping it in this file would break the running Ad Builder for the length of
-- a deploy. It is dropped in 0092, which is meant to run only after the code
-- that reads it has gone.
--
-- Run AFTER 0090. Idempotent.
-- Service-role only, admin-gated in _middleware.ts. Never client-reachable.

create table if not exists public.ad_workspace (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,

  competitors jsonb not null default '[]'::jsonb,
  angles      jsonb not null default '[]'::jsonb,

  -- [{ type, creativeId, creativeName }]. type is free text and carries what
  -- used to be the batch kind. creativeId is a Drive file id in the client's
  -- creatives folder (tenants.creatives_drive_folder_id, 0079).
  ads         jsonb not null default '[]'::jsonb,

  copy_1      text not null default '',
  copy_2      text not null default '',
  copy_3      text not null default '',

  headline_1  text not null default '',
  headline_2  text not null default '',
  headline_3  text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- No index beyond the primary key. The only read is by tenant_id, which IS the
-- primary key, so there is nothing left to index.

alter table public.ad_workspace enable row level security;
-- No policies: service-role only, same as ad_batches and ad_lead_forms. A
-- client must never reach this table. It holds competitor research and copy
-- that has not launched.

comment on table public.ad_workspace is
  'One living ad workspace per client: competitors, angles, three primaries, '
  'three headlines and the flat ad list. Replaces ad_batches (0088/0089). '
  'No rounds and no history: this is always the current set.';
