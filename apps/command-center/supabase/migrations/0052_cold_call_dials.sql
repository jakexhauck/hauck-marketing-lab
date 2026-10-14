-- 0052: cold_call_dials, one row per attempt on the agency's own cold calling.
--
-- Until now the dialing numbers were typed into the Cold Call tracker by hand.
-- That is a claim, not a measurement, and commission gets paid against it. This
-- table is the measurement: every press of an outcome button on the Leads or
-- Callbacks page appends one row here, and the tracker's four count columns are
-- DERIVED from them (functions/lib/coldCallDials.ts) rather than stored twice.
--
-- Append-only by design, same as setter_dials (0040): a dial is a fact that
-- already happened. Nothing edits or deletes a row after the fact.
--
-- The five outcomes carry two booleans between them, and that pairing is the
-- whole point: `spoke` is what makes a pickup, `pitched` is what makes a
-- pass-through. no_answer is neither; brush_off spoke but was never pitched;
-- not_interested / callback / booked are both.
--
-- `day` is stored rather than derived from dialed_at at read time. A dial at
-- 11:40pm in Detroit is 03:40 UTC the NEXT day: deriving it would file the call
-- under a day the caller never worked, and the month grid would disagree with
-- the person who made the calls. The API decides it in the agency's timezone.
--
-- lead_id is nullable and survives its lead (`on delete set null`): the dial
-- happened whether or not the prospect row is still in the book, and the daily
-- counts must not drop when a lead is purged.
--
-- Agency-global: NO tenant_id. This is Hauck Marketing calling for itself, not a
-- client's setter working a client's list (that is setter_dials).
--
-- Run AFTER 0001..0051. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.cold_call_dials (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete set null,
  caller_id  uuid not null references public.admin_accounts(id) on delete cascade,
  day        date not null,
  dialed_at  timestamptz not null default now(),
  spoke      boolean not null default false,
  pitched    boolean not null default false,
  outcome    text not null check (outcome in
               ('no_answer','brush_off','not_interested','callback','booked')),
  note       text,
  created_at timestamptz not null default now()
);

alter table public.cold_call_dials enable row level security;
-- No policies: service-role only, same as leads and cold_calls.

-- Every read is one person's month of dials, in day order.
create index if not exists cold_call_dials_caller_day_idx
  on public.cold_call_dials (caller_id, day);

-- One prospect's call history (how many times has anyone tried this number).
create index if not exists cold_call_dials_lead_idx
  on public.cold_call_dials (lead_id, dialed_at desc);

comment on table public.cold_call_dials is
  'Append-only record of every agency cold-call attempt. The Cold Call tracker''s counts are derived from these rows; typed cells in cold_calls are overrides.';

comment on column public.cold_call_dials.spoke is
  'Somebody picked up. Drives the pickup count; can never be true for outcome no_answer.';

comment on column public.cold_call_dials.pitched is
  'The call got as far as the pitch. Drives the pass-through count.';

comment on column public.cold_call_dials.day is
  'The caller''s own calendar day (agency timezone), decided server-side at write time so the month grid matches the day they worked.';
