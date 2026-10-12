-- 0159: when each cold SMS prospect was first texted (Jake, 2026-10-12).
--
-- The Pipeline board filters by the day the first text went out. GHL cannot
-- answer that: the opportunity and the conversation are both stamped at IMPORT,
-- and a batch imported at 4pm is often texted the next morning. The real time is
-- the earliest outbound message, read from GHL's message export and kept here.
--
-- cold_sms_sync_state.synced_through is the last UTC day read completely; every
-- sync re-reads from the day after it, so today is always re-read and a row is
-- only ever inserted once (the first sighting is the earliest).
--
-- cold_sms_first_text_days(tz) gives the board's day picker its days and counts
-- in Jake's zone, in SQL, because a PostgREST read stops at 1000 rows.
--
-- Service-role only. Idempotent.

create table if not exists public.cold_sms_first_texts (
  contact_id     text primary key,
  first_text_at  timestamptz not null
);

create index if not exists cold_sms_first_texts_at_idx on public.cold_sms_first_texts (first_text_at);

alter table public.cold_sms_first_texts enable row level security;

create table if not exists public.cold_sms_sync_state (
  id              boolean primary key default true,
  synced_through  date,
  updated_at      timestamptz not null default now(),
  constraint cold_sms_sync_state_singleton check (id = true)
);

alter table public.cold_sms_sync_state enable row level security;

create or replace function public.cold_sms_first_text_days(tz text)
returns table (day date, texted bigint)
language sql
stable
as $$
  select (first_text_at at time zone tz)::date as day, count(*) as texted
    from public.cold_sms_first_texts
   group by 1
   order by 1 desc;
$$;

revoke all on function public.cold_sms_first_text_days(text) from public, anon, authenticated;
