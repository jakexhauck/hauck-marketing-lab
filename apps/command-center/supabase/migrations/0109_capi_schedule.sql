-- 0109: telling Meta when a lead actually books.
--
-- WHY. Meta knows what it billed for and nothing else. It reported 51 leads for
-- Willis Windows in thirty days; whether any of them booked an appointment is
-- invisible to it, so the campaign optimises toward whoever fills in a form
-- rather than whoever turns up. Reporting the booking back closes that loop,
-- and it is also the only way the dashboard's Bookings figure can ever agree
-- with Ads Manager, since Meta cannot report a conversion nobody sent it.
--
-- Two tables, for two different problems.
--
-- capi_identity: the click signals, kept.
--
--   Meta scores a conversion on `fbc` (built from the ad click) and `fbp` (the
--   browser), far above hashed contact details. The funnel has both at the
--   moment the homeowner submits, and /api/capi/lead threw them away after
--   sending the Lead event. A booking made three days later then had nothing
--   but an email to match on, and match quality is the difference between Meta
--   attributing the booking to the ad and discarding it.
--
--   Keyed by HASHED email and phone, never the raw values: this table exists so
--   a booking can find a click, not so anyone can look up a homeowner. The
--   hashes are the same SHA-256 of the same normalised strings that go to Meta
--   (see functions/lib/metaCapi.ts), so the lookup is a plain equality match.
--
--   Not unique on anything. One person filling the form twice is two rows, and
--   the newest matching row wins at read time. A unique key here would mean
--   choosing which submission's fbc to discard, and the newest click is the one
--   worth keeping.
--
-- capi_sent: the idempotency ledger.
--
--   Both paths that can report a booking (the GHL AppointmentCreate webhook,
--   and the polling sync for the clients whose webhook is not wired) key the
--   event on the GHL appointment id. Meta deduplicates on event_id too, but
--   only for a window and only per pixel, and a re-run that re-sends a hundred
--   events is a bad neighbour regardless. This ledger makes a re-run free.
--
--   The unique key is (funnel, event_name, event_id): the same appointment can
--   legitimately produce a Schedule now and something else later.
--
-- Run AFTER 0001..0108. Idempotent: safe to re-run.

create table if not exists public.capi_identity (
  id          uuid primary key default gen_random_uuid(),
  -- FUNNEL_CAPI key in functions/lib/metaCapi.ts, e.g. 'willis'. Not a tenant
  -- id: a funnel is a hand-written set of files and the pixel belongs to it.
  funnel      text not null,
  email_hash  text,
  phone_hash  text,
  fbc         text,
  fbp         text,
  source_url  text,
  created_at  timestamptz not null default now()
);

alter table public.capi_identity enable row level security;

-- Both lookups are "this funnel, this hash, newest first".
create index if not exists capi_identity_email_idx
  on public.capi_identity (funnel, email_hash, created_at desc)
  where email_hash is not null;

create index if not exists capi_identity_phone_idx
  on public.capi_identity (funnel, phone_hash, created_at desc)
  where phone_hash is not null;

create table if not exists public.capi_sent (
  id          uuid primary key default gen_random_uuid(),
  funnel      text not null,
  event_name  text not null,
  -- The GHL appointment id for a Schedule.
  event_id    text not null,
  tenant_id   uuid references public.tenants (id) on delete cascade,
  -- Meta's answer, kept so a silently rejected event is diagnosable later.
  ok          boolean not null default false,
  detail      text,
  sent_at     timestamptz not null default now(),
  unique (funnel, event_name, event_id)
);

alter table public.capi_sent enable row level security;

create index if not exists capi_sent_tenant_idx
  on public.capi_sent (tenant_id, sent_at desc);

-- Meta's own count of booked appointments for this ad on this day, mirroring
-- the `leads` column added in 0108.
--
-- It reads 0 for every historical row and cannot be backfilled: Meta rejects any
-- conversion more than seven days old, so its Bookings figure necessarily
-- starts from the day the reporting above was switched on and fills in from
-- there. Stored now regardless, so that history accumulates from day one rather
-- than starting on whichever later day somebody remembers to add the column.
alter table public.meta_ad_days
  add column if not exists meta_bookings bigint not null default 0;

comment on column public.meta_ad_days.meta_bookings is
  'Meta''s Schedule conversion count for this ad on this day. Only non-zero once bookings are reported back via functions/lib/capiSchedule.ts; never backfillable past Meta''s seven-day event window.';

comment on table public.capi_identity is
  'fbc/fbp click signals captured at funnel submit, so a booking days later can still be attributed to the ad. Keyed by hashed email/phone; no raw personal data.';

comment on table public.capi_sent is
  'Idempotency ledger for Meta Conversions API events. One row per (funnel, event_name, event_id); event_id is the GHL appointment id for Schedule.';
