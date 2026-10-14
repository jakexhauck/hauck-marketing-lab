-- 0162: booked prospects leave the Cold SMS board (Jake, 2026-10-13).
--
-- Anyone with a card in the agency "Sales" pipeline was booked, wherever the
-- booking was made (the app's Book call, GHL by hand, Cold Call). On each board
-- load the app deletes their Cold SMS card. This remembers who has been swept so
-- a load only looks up NEW bookings: one GHL search per contact, and a request
-- may make at most 50 outside calls.
--
-- Service-role only (RLS on, no policies). Idempotent.

create table if not exists public.cold_sms_booked_swept (
  contact_id  text primary key,
  removed     integer not null default 0,
  swept_at    timestamptz not null default now()
);

alter table public.cold_sms_booked_swept enable row level security;
