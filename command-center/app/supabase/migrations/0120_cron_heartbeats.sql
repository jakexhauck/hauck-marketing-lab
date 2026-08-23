-- Heartbeats for the scheduled workers.
--
-- Cloudflare Pages has no cron triggers, so four sibling Workers call four
-- authenticated routes on their own clocks. If a Worker stops firing (secret
-- rotated wrong, deployment deleted, Cloudflare incident), nothing noticed:
-- the route simply stopped being called, and spend, calendars or dials went
-- silently stale. The health probe could only ever watch health-cron itself,
-- because that one leaves snapshots behind.
--
-- This table gives every scheduled job the same receipt pattern: the handler
-- bumps its row after a successful run, and the connection-health probe reads
-- freshness from it. Staleness flips the probe to failed, and the EXISTING
-- snapshot-diff alert machinery (lib/healthWatch.ts) pushes to Jake's phone,
-- exactly as it already does for a dead token. No new alert path, no new
-- Worker, no deploy of anything outside this app.
--
-- Additive and idempotent.

create table if not exists public.cron_heartbeats (
  job text primary key,
  last_ok_at timestamptz not null default now(),
  detail text
);

alter table public.cron_heartbeats enable row level security;

comment on table public.cron_heartbeats is
  'One row per scheduled job (ads-sync, calendar-sync, cold-call-sync). Bumped by each handler after success; freshness is judged by the health probe.';
