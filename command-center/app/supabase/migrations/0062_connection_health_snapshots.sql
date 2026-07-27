-- 0062: what every connection looked like the last time the watchdog ran.
--
-- The control room tells you what is broken when you open it. This table is
-- what lets it tell you WITHOUT you opening it, because the only thing worth
-- waking someone for is a change: a row that was fine half an hour ago and is
-- not fine now. Answering that needs the previous run to still exist, which is
-- the entire job of this table.
--
-- One row per connection per run, grouped by `run_id`. Rows rather than a JSON
-- blob because the interesting query is "what did THIS connection look like
-- last time", and comparing two blobs in SQL is how that becomes unreadable.
--
-- `state` mirrors ConnState in src/lib/connectionHealth.ts and the check
-- constraint is deliberate: a typo'd state would silently never match its own
-- previous value and would therefore alert forever, which is the exact failure
-- mode this whole feature exists to avoid.
--
-- `connection_id` is the registry id for an agency connection, or
-- `client:<slug>:<id>` for one client's own credential, so a single client's
-- dead token is its own flip instead of hiding behind the others.
--
-- Retention is handled by the writer (functions/lib/healthWatch.ts prunes
-- anything older than 7 days). At one run every 30 minutes across ~20
-- connections that settles around 7k rows, which is small enough to leave
-- alone and long enough to answer "when did this actually break".
--
-- Run AFTER 0001..0061. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions.

create table if not exists public.connection_health_snapshots (
  id            uuid primary key default gen_random_uuid(),

  -- Groups the rows written by a single run. Every row of one check shares it,
  -- so "the previous snapshot" is one indexed lookup rather than a guess at a
  -- timestamp window.
  run_id        uuid not null,

  checked_at    timestamptz not null default now(),

  -- Registry id, or client:<slug>:<id> for a per-client credential.
  connection_id text not null,

  -- What a human calls it, captured at write time. Stored rather than joined so
  -- an alert about a connection that was later renamed or removed from the
  -- registry still reads as the thing that broke.
  label         text not null default '',

  state         text not null check (state in ('live', 'down', 'unverified', 'unconfigured')),

  -- The one line explaining the state: the probe's own message, or the names of
  -- the missing credentials.
  detail        text not null default ''
);

alter table public.connection_health_snapshots enable row level security;
-- No policies: service-role only, same as every other admin-owned table here.

-- The only hot query: the most recent run before this one, whole.
create index if not exists connection_health_snapshots_run_idx
  on public.connection_health_snapshots (checked_at desc, run_id);

-- "When did this one actually break", and the pruning sweep.
create index if not exists connection_health_snapshots_conn_idx
  on public.connection_health_snapshots (connection_id, checked_at desc);

comment on table public.connection_health_snapshots is
  'One row per connection per scheduled health run. Exists so the watchdog can alert on a CHANGE rather than on every red row every 30 minutes, which is how a monitor becomes something everyone mutes. Written by functions/api/admin/connections/health.ts, compared by src/lib/healthSnapshots.ts.';

comment on column public.connection_health_snapshots.run_id is
  'Groups one run''s rows. The previous snapshot is the newest run_id older than the current one.';

comment on column public.connection_health_snapshots.label is
  'Captured at write time on purpose: an alert about a since-renamed connection should still name the thing that broke.';
