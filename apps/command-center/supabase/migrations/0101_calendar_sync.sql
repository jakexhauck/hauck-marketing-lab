-- 0101: Google Calendar two-way sync.
-- Run AFTER 0001..0100. Idempotent: safe to re-run.
--
-- What this makes possible: a client connects their own Google Calendar in our
-- app, and from then on their real commitments block the calendar customers
-- book into, while every booking lands in their diary.
--
-- Why it is not GoHighLevel's own Google integration: that is configured inside
-- GHL, per USER, by hand, and there is no API to start it on a client's behalf.
-- It would also mean sending a client into GoHighLevel's UI, which is the one
-- thing every client-facing surface in this app is built to avoid.

-- ---------------------------------------------------------------------------
-- gcal_busy_blocks: what we have written INTO GHL, so we can take it back out.
--
-- Without this the sync could only ever add. A meeting cancelled in Google
-- would leave its blocked slot in GHL forever, and the client would slowly lose
-- their own availability with no error anywhere and no way to find the cause.
create table if not exists public.gcal_busy_blocks (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- The Google event this block mirrors. A recurring event yields one row per
  -- instance, which is why this is the instance id rather than the series id.
  gcal_event_id text not null,
  -- The GHL blocked-slot event we created for it.
  ghl_block_id text not null,
  ghl_calendar_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, gcal_event_id)
);

create index if not exists gcal_busy_blocks_tenant_idx
  on public.gcal_busy_blocks (tenant_id, starts_at);

-- ---------------------------------------------------------------------------
-- Which calendar a client's busy time blocks.
--
-- Matched by NAME by default ("Home Estimate"), the same way clientPipelines.ts
-- matches the agency's Cold Calling board: ids are per-location and name
-- matching is what makes the next client work without a remap.
--
-- This column is the override for a client who names theirs something else.
-- NULL means "match by name", which is the case for every client today.
alter table public.tenants
  add column if not exists estimate_calendar_id text;

-- ---------------------------------------------------------------------------
-- The connect gate's third step.
--
-- Set TRUE for every tenant that already exists, and default FALSE so every
-- tenant created after this migration is gated. This is the whole point of
-- doing it in the migration rather than in code: the social connect gate locked
-- a live client out the moment it deployed, and the fix for that is computing
-- who a new gate blocks BEFORE it ships, not after somebody calls.
--
-- To require a calendar from an existing client, set this back to false for
-- them. That is a deliberate act with a name on it, not a side effect of a
-- deploy.
-- The grandfathering runs ONLY on the pass that creates the column. A plain
-- "update ... where calendar_gate_waived = false" would look idempotent and is
-- not: re-running it would silently re-waive a client you had since decided to
-- chase, undoing a deliberate act with no trace.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
      and column_name = 'calendar_gate_waived'
  ) then
    alter table public.tenants
      add column calendar_gate_waived boolean not null default false;
    update public.tenants set calendar_gate_waived = true;
  end if;
end $$;
