-- 0118: the area code of a lead's number, as a column, so the Leads page can be
-- filtered to one timezone.
--
-- A caller works one list all day and the list is not in one timezone. Until now
-- the only way to work the west coast was to wait until it was 8am there for the
-- whole list, or to read every row's number and guess. The timezone a number is
-- in is already known (functions/lib/leadZones.ts maps every North American area
-- code to a zone) but it was known only in the BROWSER, which means it could
-- only ever filter the rows already on screen. The page shows 200 at a time out
-- of 214 callable, so a filter done there would have quietly dropped the tail of
-- the list and reported a wrong total with it.
--
-- Stored and generated rather than derived per query: the filter is an IN over
-- roughly 180 codes and it has to be indexable, and a generated column cannot
-- drift from the number it is generated from.
--
-- Written to survive a bad number: regexp_replace strips punctuation, right(10)
-- takes the national part whether or not the +1 is there, and a number too short
-- to have an area code yields something that matches no zone, which is the
-- honest answer rather than a wrong one.
--
-- Idempotent: safe to re-run.

alter table public.cold_sms_outreach_numbers
  add column if not exists area_code text
  generated always as (
    substr(right(regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g'), 10), 1, 3)
  ) stored;

create index if not exists cold_sms_outreach_numbers_area_code_idx
  on public.cold_sms_outreach_numbers (area_code);

comment on column public.cold_sms_outreach_numbers.area_code is
  'The three-digit area code of phone_e164, generated. Read only by the Leads '
  'timezone filter, which turns a zone into the list of codes that sit in it '
  '(functions/lib/leadZones.ts). Area codes follow states and several states '
  'straddle a zone line, so a handful of numbers are an hour out; each code is '
  'filed under the zone most of its territory keeps.';
