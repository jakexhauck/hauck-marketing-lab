-- 0107: which of a client's calendars their own diary protects.
-- Run AFTER 0001..0106. Idempotent: safe to re-run.
--
-- 0101 shipped the sync that pushes a client's real Google commitments into the
-- GoHighLevel calendar customers book into. It protected exactly ONE calendar,
-- found by matching the name "Home Estimate", because that was the only
-- customer-facing calendar on the sub-account it was written against.
--
-- It is not the only one. Made Better and Willis each carry four (Home Estimate,
-- Job, Phone Appointment, and one more apiece), and every calendar the sync does
-- not know about can still be booked over the top of the owner's own diary. The
-- choice of which ones matter is an operator's, not a constant's, so it becomes
-- rows and a screen: Fulfillment > GHL > Calendars.

-- ---------------------------------------------------------------------------
-- The selection.
--
-- Rows rather than an array column on tenants: a calendar deleted in GHL leaves
-- one dead row that is obvious and harmless, where an array quietly becomes a
-- list of ids that no longer mean anything.
--
-- NO ROWS FOR A TENANT MEANS THE OLD BEHAVIOUR, not "protect nothing" and not
-- "protect everything". calendarSync.ts falls back to the name match, so this
-- migration cannot change what any existing client is protected by, and turning
-- the first switch on is what opts them into the new model.
create table if not exists public.tenant_blocked_calendars (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- GHL's own calendar id, per location. Not a foreign key to anything of ours:
  -- the calendars live in GoHighLevel and are read live.
  ghl_calendar_id text not null,
  -- Kept for the operator, so a list can be read without calling GHL. Display
  -- only; the id is what the sync uses.
  name text,
  added_at timestamptz not null default now(),
  primary key (tenant_id, ghl_calendar_id)
);

alter table public.tenant_blocked_calendars enable row level security;

comment on table public.tenant_blocked_calendars is
  'Which GHL calendars a client''s Google busy time blocks. No rows = fall back to the Home Estimate name match (0101).';

-- ---------------------------------------------------------------------------
-- One meeting, several calendars.
--
-- gcal_busy_blocks was keyed (tenant_id, gcal_event_id), which encodes "one
-- Google event yields one block". Protecting three calendars means three blocks
-- for one event, so the calendar has to be part of the key. Without this the
-- second calendar's block would upsert over the first's row, the first block
-- would be orphaned in GHL with nothing pointing at it, and the client would
-- lose that slot permanently with no way to find out why.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gcal_busy_blocks'::regclass
      and contype = 'p'
      and conname = 'gcal_busy_blocks_pkey'
      and array_length(conkey, 1) = 2
  ) then
    alter table public.gcal_busy_blocks
      drop constraint gcal_busy_blocks_pkey;
    alter table public.gcal_busy_blocks
      add constraint gcal_busy_blocks_pkey
      primary key (tenant_id, gcal_event_id, ghl_calendar_id);
  end if;
end $$;

-- The sync reads a tenant's blocks and diffs them per calendar.
create index if not exists gcal_busy_blocks_calendar_idx
  on public.gcal_busy_blocks (tenant_id, ghl_calendar_id);
