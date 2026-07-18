-- 0031: Time Audit blocks. Where Jake's hours actually go.
--
-- The Operations "Time Audit" surface is a week grid: rows are 30-minute blocks
-- from 6:00 AM to 10:00 PM (32 slots), columns are Mon through Sun. Clicking a
-- cell cycles its task type, and the task's default leverage tier is what prices
-- the half hour. Both are stored, so a Phase 2 "override the leverage on this
-- one block" does not need a backfill.
--
-- One row per TAGGED block, keyed (week_start, day_of_week, slot). Untagged is
-- the absence of a row, not a null tag: clearing a cell DELETEs it. That keeps
-- the by-week GET trivial and means an untouched week is honestly empty and
-- worth $0 rather than a grid of nulls the UI has to explain.
--
-- Agency-internal, so NO tenant_id (see docs/build-plans/admin-redesign/
-- _architecture.md): this is Jake's own time, single agency, global row set.
-- Reached only through the service-role client behind the /api/admin/*
-- middleware gate, so no RLS policy is required for it to work.
--
-- Run AFTER 0001..0030. Idempotent: safe to re-run.

create table if not exists public.time_audit_blocks (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  day_of_week integer not null,
  slot        integer not null,
  leverage    text not null,
  task_type   text not null,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint time_audit_blocks_day_chk check (day_of_week between 0 and 6),
  constraint time_audit_blocks_slot_chk check (slot between 0 and 31),
  constraint time_audit_blocks_leverage_chk
    check (leverage in ('Low', 'Low-Mid', 'Mid', 'Mid-High', 'High')),
  constraint time_audit_blocks_task_chk
    check (task_type in ('Outreach', 'Sales calls', 'Roleplays', 'Scraping leads', 'Scrolling', 'Admin'))
);

-- One tag per block, and the upsert conflict target for PATCH.
create unique index if not exists time_audit_blocks_cell_uidx
  on public.time_audit_blocks (week_start, day_of_week, slot);

-- The grid's only read: every tagged block in one week.
create index if not exists time_audit_blocks_week_idx
  on public.time_audit_blocks (week_start);
