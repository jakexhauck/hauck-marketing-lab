-- Only a mobile may be dialled, enforced where nothing can route around it.
--
-- 0114 stamped line_type on scraped leads and refused a landline at the two SEND
-- paths. That covers a number arriving from the Leads page and nothing else. The
-- call book (public.leads) is written by six other paths as well: the manual "Add
-- lead" button, the CSV import, the GoHighLevel sync, the power-dialer reconcile,
-- and so on. Patching each one is a list nobody will keep complete.
--
-- So the block map moves into the database and a trigger does the stamping. Any
-- row, from any path, present or future, gets an answer without its author having
-- to know this exists. The Cold Call surfaces then refuse anything that is not
-- 'wireless'.
--
-- The map is loaded by lead-scraper/load_npanxx.py straight after this runs, and
-- refreshed by the same script whenever NANPA's file moves on.

create table if not exists public.npanxx_line_type (
  npanxx text primary key,
  line_type text not null check (line_type in ('wireless', 'landline'))
);

comment on table public.npanxx_line_type is
  'Which carrier type owns each six-digit NPA-NXX block, derived from NANPA''s free public code assignment file. Block level and blind to number portability, so roughly 70-80% accurate. Loaded by lead-scraper/load_npanxx.py.';

-- Nobody reads this table directly; everything goes through the lookup below.
alter table public.npanxx_line_type enable row level security;

-- The one place a phone number becomes an answer.
--
-- Deliberately answers 'unknown' rather than guessing when the block is not in the
-- map: toll-free and out-of-country numbers are not in NANPA's file at all, and
-- calling them landline would be inventing a fact. Every caller treats 'unknown'
-- the same as landline anyway, because the burden runs one way: a number has to be
-- PROVED a mobile before anybody rings it.
create or replace function public.line_type_for_phone(raw text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with digits as (
    select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d
  ),
  national as (
    select case
      when length(d) = 11 and left(d, 1) = '1' then right(d, 10)
      when length(d) = 10 then d
      else null
    end as n
    from digits
  )
  select coalesce(
    (select t.line_type from public.npanxx_line_type t
      where t.npanxx = left((select n from national), 6)
        and (select n from national) is not null),
    'unknown'
  );
$$;

create or replace function public.set_line_type()
returns trigger
language plpgsql
as $$
begin
  new.line_type := public.line_type_for_phone(new.phone);
  return new;
end;
$$;

alter table public.leads
  add column if not exists line_type text;

comment on column public.leads.line_type is
  'wireless | landline | unknown, stamped by trigger from npanxx_line_type. The Cold Call surfaces refuse to dial anything that is not wireless.';

-- BEFORE, so the value is written with the row rather than in a second pass, and
-- on UPDATE OF phone so correcting a typo re-answers the question.
drop trigger if exists leads_set_line_type on public.leads;
create trigger leads_set_line_type
  before insert or update of phone on public.leads
  for each row execute function public.set_line_type();

-- The scraped-leads table gets the same treatment, so a scrape run from an old
-- checkout of the Python cannot write a row with no answer on it.
create or replace function public.set_line_type_e164()
returns trigger
language plpgsql
as $$
begin
  new.line_type := public.line_type_for_phone(new.phone_e164);
  return new;
end;
$$;

drop trigger if exists cold_sms_set_line_type on public.cold_sms_outreach_numbers;
create trigger cold_sms_set_line_type
  before insert or update of phone_e164 on public.cold_sms_outreach_numbers
  for each row execute function public.set_line_type_e164();

create index if not exists leads_line_type_idx on public.leads (line_type);
