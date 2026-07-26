-- 0057: the demo call. What happened on it, and what was agreed.
--
-- A cold caller books a business owner onto Hauck Marketing's OWN calendar
-- (functions/api/admin/cold-call/book.ts). Cold Call's job ends there: the
-- `Booked` stage is marked terminal. This table is the other side of that
-- handover, and it is the answer to a question the cold-call work wrote down
-- and could not answer:
--
--   "a meeting that has been and gone sits under Already happened ... until a
--    showed / no-showed outcome exists to record"
--
-- This is that outcome.
--
-- The row is keyed by the GoHighLevel appointment id, so a call can be logged
-- exactly once no matter how many times the page is opened.
--
-- The prospect's name, business and number are COPIED here rather than read
-- through to the lead every time. That is not denormalisation for speed: a
-- contact deleted in GHL, or a lead tidied away, must not turn a real recorded
-- conversation into a row about nobody.
--
-- Nothing in here is ever written back to GoHighLevel. The app reads the
-- calendar and records what happened; every pipeline move and every automation
-- stays Jake's, driven from tags inside GHL. This is the same rule
-- functions/lib/agencyGhl.ts already states for the cold caller, and it holds
-- for the same reason: two systems moving one card is how a pipeline starts
-- lying about itself.
--
-- Run AFTER 0001..0056. Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Settings for the agency's own selling, as opposed to a client's.
--
-- One row, pinned to id='agency', matching how cold_call_script (0048) holds
-- the one agency script.
create table if not exists public.agency_settings (
  id                 text primary key default 'agency',
  -- WHICH calendar holds demo calls. This is not a convenience: the agency
  -- account also carries an Onboarding calendar that a personal Google account
  -- syncs flight bookings into. Reading "every active calendar", the way the
  -- per-client Setter Calendar does, would list a flight to Atlanta as a demo
  -- call with a Start Call button on it. Null means nobody has chosen yet, and
  -- the page says so rather than guessing.
  demo_calendar_id   text,
  -- The guided note prompts, in order: [{ id, label }]. Editable because the
  -- questions worth asking on a sales call change faster than a deploy cycle.
  call_note_sections jsonb not null default '[
    {"id":"situation","label":"Their situation"},
    {"id":"problem","label":"The problem"},
    {"id":"cost","label":"What it is costing them"},
    {"id":"budget","label":"Budget"},
    {"id":"decision","label":"Decision maker"},
    {"id":"objections","label":"Objections"}
  ]'::jsonb,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

insert into public.agency_settings (id)
values ('agency')
on conflict (id) do nothing;

comment on column public.agency_settings.demo_calendar_id is
  'The one agency calendar that holds demo calls. Never "all active calendars": the Onboarding calendar carries synced personal events.';

-- ---------------------------------------------------------------------------
create table if not exists public.sales_calls (
  id                   uuid primary key default gen_random_uuid(),

  -- Identity. The appointment id is the key: one row per booking, forever.
  ghl_appointment_id   text not null unique,
  ghl_contact_id       text,
  -- The lead behind the contact, found through leads.ghl_contact_id (0053).
  -- Nulled rather than cascaded on delete: the call happened either way.
  lead_id              uuid references public.leads(id) on delete set null,

  -- The prospect, as they were when the call was booked.
  prospect_name        text not null default '',
  business_name        text not null default '',
  phone                text not null default '',
  email                text not null default '',
  timezone             text not null default '',
  source               text not null default '',

  -- The booking.
  scheduled_at         timestamptz,
  appointment_status   text not null default 'confirmed',

  -- The call itself. started_at is set by Start Call, so a call in progress
  -- survives a refresh or a closed tab.
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_seconds     integer,

  -- The result. Null outcome = booked but not yet logged, which is the state
  -- every row begins in.
  outcome              text
                         check (outcome is null or outcome in
                           ('closed','follow_up','no_show','not_a_fit')),
  -- Whether they were a real prospect at all. Kept separate from the outcome
  -- because Sales Data counts qualified and closed as two different things,
  -- and a qualified prospect who did not buy is the most useful row there is.
  qualified            boolean,
  not_a_fit_reason     text,
  follow_up_at         timestamptz,

  -- The notes. `sections` is keyed by the section ids in
  -- agency_settings.call_note_sections; a renamed or removed section leaves its
  -- answers here rather than destroying them, so old calls stay readable.
  sections             jsonb not null default '{}'::jsonb,
  scratchpad           text not null default '',

  -- The deal, holding only the components that were ticked:
  --   { upfrontFee, monthlyRetainer, revSharePct, perJobFee,
  --     contractMonths, adSpendBudget }
  -- A jsonb blob rather than six columns because the shape of what Jake sells
  -- is still moving, and a new component should not be a migration.
  deal                 jsonb,
  -- Money actually taken on the call. This one IS a column, not part of `deal`:
  -- it is what the Sales Data Cash column sums, so it has to be countable.
  cash_collected       numeric(12,2),

  logged_by            uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- The page's main read: a window of calls, soonest first.
create index if not exists sales_calls_scheduled_idx
  on public.sales_calls (scheduled_at desc);

-- Sales Data derives a month of counts from this; without it that is a scan
-- per month view.
create index if not exists sales_calls_outcome_idx
  on public.sales_calls (scheduled_at, outcome);

-- "What follow-ups do I owe" is a page, so it is an index.
create index if not exists sales_calls_follow_up_idx
  on public.sales_calls (follow_up_at)
  where follow_up_at is not null;

create index if not exists sales_calls_lead_idx
  on public.sales_calls (lead_id)
  where lead_id is not null;

comment on table public.sales_calls is
  'One demo call. Created from the agency demo calendar on read, completed by whoever ran the call. Never written back to GoHighLevel.';

comment on column public.sales_calls.qualified is
  'Was this a real prospect. Sales Data counts qualified and closed separately, so this cannot be inferred from the outcome.';

comment on column public.sales_calls.cash_collected is
  'Money taken on the call. A column rather than part of `deal` because Sales Data sums it.';
