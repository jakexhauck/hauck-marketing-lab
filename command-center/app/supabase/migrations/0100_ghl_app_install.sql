-- 0100: GoHighLevel Marketplace app install, event health, stage overrides.
-- Run AFTER 0001..0099. Idempotent: safe to re-run.
--
-- Until now every reporting event reached this app because Jake hand-built a
-- workflow inside each sub-account with a Webhook action and a hand-typed
-- custom payload. Fourteen event types, per client, forever.
--
-- The Marketplace app replaces that: one private app, installed once across
-- every sub-account, streaming native events to /api/crm/app-webhook. These
-- tables are what the app needs to route, verify and cut over safely.

-- ---------------------------------------------------------------------------
-- ghl_installs: OAuth tokens from the Marketplace app.
--
-- Two kinds of row, distinguished by location_id:
--   location_id = ''      the AGENCY (company) row, one per company_id. This is
--                         the token the install itself returns (userType
--                         "Company"), and the only one that can mint the others.
--   location_id = '<id>'  a sub-account token, minted on demand from the agency
--                         row via POST /oauth/locationToken, then cached here.
--
-- The empty string is deliberate rather than NULL. PostgREST can only infer a
-- FULL unique index for onConflict (the lesson from 0012 and 0006), and NULLs
-- never collide in a unique index, so a NULL agency row could be inserted twice.
create table if not exists public.ghl_installs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  location_id text not null default '',
  -- Null for the agency row, and null for a sub-account we have a token for but
  -- have not matched to a client yet (an install can arrive before onboarding).
  tenant_id uuid references public.tenants(id) on delete set null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scopes text,
  -- "Company" or "Location", straight off the token response.
  user_type text not null default 'Location',
  installed_at timestamptz not null default now(),
  -- Set by the App Uninstall webhook. A revoked row is kept, not deleted, so
  -- the Connection page can say "uninstalled on the 4th" rather than going
  -- blank and looking like it was never wired.
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists ghl_installs_company_location_idx
  on public.ghl_installs (company_id, location_id);

create index if not exists ghl_installs_tenant_idx
  on public.ghl_installs (tenant_id);

-- ---------------------------------------------------------------------------
-- ghl_event_seen: the health board's entire data source.
--
-- One row per (tenant, event type, source), bumped on every inbound event.
-- Deliberately NOT derived from activity_log: that table only holds the events
-- the normalizer recognises, so an event type arriving and being dropped would
-- look identical to an event type never arriving at all. This records what GHL
-- actually sent, which is the question the page is asking.
create table if not exists public.ghl_event_seen (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  -- 'app' (Marketplace) or 'workflow' (the hand-built webhook actions).
  source text not null,
  last_seen_at timestamptz not null default now(),
  total bigint not null default 0,
  primary key (tenant_id, event_type, source)
);

-- Bump a counter in one round trip. PostgREST's upsert cannot express
-- "total = total + 1", and a read-modify-write from a Worker would lose counts
-- under concurrent webhooks.
create or replace function public.ghl_event_seen_bump(
  p_tenant_id uuid,
  p_event_type text,
  p_source text
) returns void
language sql
as $$
  insert into public.ghl_event_seen (tenant_id, event_type, source, last_seen_at, total)
  values (p_tenant_id, p_event_type, p_source, now(), 1)
  on conflict (tenant_id, event_type, source)
  do update set last_seen_at = now(), total = public.ghl_event_seen.total + 1;
$$;

-- ---------------------------------------------------------------------------
-- ghl_stage_map: per-tenant OVERRIDES for the stage -> client status mapping.
--
-- functions/lib/leadStatus.ts already derives a status from a stage NAME, and
-- that stays the default: matching by name is what makes a new client work
-- without a remap. This table exists only for the stages that name matching
-- gets wrong, keyed by stage id because that is the thing that is unambiguous
-- once you have decided to override it.
--
-- An empty table means the app behaves exactly as it does today.
create table if not exists public.ghl_stage_map (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pipeline_id text not null,
  stage_id text not null,
  -- Names are stored for display only, so the page can show what was mapped
  -- even after a stage is renamed in GHL. Never matched on.
  pipeline_name text,
  stage_name text,
  lead_status text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, pipeline_id, stage_id)
);

-- ---------------------------------------------------------------------------
-- tenants.ghl_event_source: the cutover switch.
--
-- Every existing client defaults to 'workflow', which is exactly what they run
-- today. Nothing changes for anyone until the switch is flipped on the
-- Connection page.
--
-- Why a switch and not a migration: the moment the app is installed on a
-- location, GHL fires OpportunityStageUpdate AND Jake's existing workflow fires
-- its own webhook for the same real-world change. Different event ids, so the
-- (tenant_id, ghl_event_id) index from 0012 cannot dedupe them. Two activity
-- rows, and two pushes: the client's phone buzzing twice for one lead.
alter table public.tenants
  add column if not exists ghl_event_source text not null default 'workflow';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_ghl_event_source_chk'
  ) then
    alter table public.tenants
      add constraint tenants_ghl_event_source_chk
      check (ghl_event_source in ('workflow', 'app'));
  end if;
end $$;
