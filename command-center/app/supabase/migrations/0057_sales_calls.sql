-- 0057: sales_calls, what a booked meeting actually became.
--
-- Cold Call ends at "Booked". Until now that was the last thing the app knew: a
-- meeting that had been and gone sat under "Already happened" forever, so the
-- one number that decides whether the dialing is worth doing (booked -> showed
-- -> closed) could not be read anywhere. This table is that record.
--
-- One row per appointment, keyed on GoHighLevel's own appointment id, because
-- the calendar over there is the source of truth for WHEN the meeting is and
-- this table is the source of truth for WHAT HAPPENED at it. `unique
-- (ghl_appointment_id)` is what makes the sync repeatable: pulling the same
-- appointment twice updates one row rather than growing a second.
--
-- Two different questions live in two different columns, and conflating them is
-- the mistake this shape exists to prevent:
--   appointment_status  where the meeting stands on the calendar (confirmed,
--                       cancelled, and so on). GoHighLevel owns this.
--   outcome             what the meeting produced. Null until it has happened,
--                       then one of closed / follow_up / no_show / not_a_fit.
--                       Nobody but the person who ran the call owns this.
--
-- A no-show is an outcome rather than a status: the meeting DID reach its slot,
-- somebody sat waiting, and that is a different fact from a meeting cancelled in
-- advance. Confusing the two is how a show rate quietly becomes a lie.
--
-- lead_id is nullable and survives its lead (`on delete set null`): a meeting
-- that happened is a fact whether or not the prospect row is still in the book,
-- and revenue must not vanish when a list is purged.
--
-- Agency-global: NO tenant_id. This is Hauck Marketing selling for itself.
--
-- Run AFTER 0001..0056. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.sales_calls (
  id                 uuid primary key default gen_random_uuid(),

  -- The calendar's identity for this meeting, and the prospect it belongs to.
  ghl_appointment_id text not null unique,
  ghl_contact_id     text,
  lead_id            uuid references public.leads(id) on delete set null,

  -- Copied off the lead at booking time so a purged prospect still has a name on
  -- the revenue line. Never null; an unknown value is an empty string.
  prospect_name      text not null default '',
  business_name      text not null default '',
  phone              text not null default '',
  email              text not null default '',
  timezone           text not null default '',
  source             text not null default '',

  -- Where the meeting stands on the calendar. GoHighLevel's answer, mirrored.
  scheduled_at       timestamptz,
  appointment_status text not null default 'confirmed',

  -- What the meeting produced. Null until somebody says.
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_seconds   integer,
  outcome            text check (outcome is null or outcome in
                       ('closed','follow_up','no_show','not_a_fit')),
  qualified          boolean,
  not_a_fit_reason   text,
  follow_up_at       timestamptz,

  -- The call itself: notes taken against the agenda, and anything typed loose.
  sections           jsonb not null default '{}'::jsonb,
  scratchpad         text not null default '',

  -- What was sold. Null unless the outcome was a close.
  deal               jsonb,
  cash_collected     numeric,

  logged_by          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.sales_calls enable row level security;
-- No policies: service-role only, same as leads and cold_call_dials.

-- The Booked page: upcoming first, then backwards through what has happened.
create index if not exists sales_calls_scheduled_idx
  on public.sales_calls (scheduled_at desc);

-- "Of the meetings booked this month, how many showed and how many closed."
create index if not exists sales_calls_outcome_idx
  on public.sales_calls (scheduled_at, outcome);

-- Who is owed a second conversation, and when.
create index if not exists sales_calls_follow_up_idx
  on public.sales_calls (follow_up_at)
  where follow_up_at is not null;

-- One prospect's meeting history, from the lead row.
create index if not exists sales_calls_lead_idx
  on public.sales_calls (lead_id)
  where lead_id is not null;

comment on table public.sales_calls is
  'One row per booked sales meeting: the calendar''s view of it (appointment_status) and what it produced (outcome). Keyed on the GoHighLevel appointment id so syncing is repeatable.';

comment on column public.sales_calls.appointment_status is
  'Where the meeting stands on the GoHighLevel calendar. Not what happened at it: see outcome.';

comment on column public.sales_calls.outcome is
  'What the meeting produced. Null until it has happened. A no_show is an outcome, not a status: the slot was reached and nobody came.';

comment on column public.sales_calls.cash_collected is
  'Money taken on the call itself, not contract value. Null unless the outcome was a close.';
