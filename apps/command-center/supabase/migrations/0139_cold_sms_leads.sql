-- 0139: cold_sms_leads, Acquisition > Cold SMS > Leads (Jake, 2026-10-06).
--
-- Textable leads from cold-sms-pipeline/ (`python run.py upload`), one row per
-- phone. Jake filters by city, line type and service, says how many, and
-- downloads them as the GHL import CSV. A downloaded lead carries its
-- export_batch and never comes out again except by re-downloading that batch.
--
-- Separate from cold_sms_outreach_numbers (the old app scraper's table) on
-- purpose: the pipeline replaced that scraper for cold SMS.
--
-- Everything that reads or takes leads runs in the database:
--   * cold_sms_lead_groups   available counts per city/line type/service, so the
--                            page never counts by fetching rows (PostgREST caps
--                            every read at 1000, silently).
--   * cold_sms_lead_batches  one row per download.
--   * cold_sms_leads_pick()  the preview AND the take, one query, so the file is
--                            always the list that was on screen. Returns jsonb,
--                            which the row cap does not apply to.
--
-- Idempotent: safe to re-run. Service-role only (RLS on, no policies).

create table if not exists public.cold_sms_leads (
  phone         text primary key,
  company_name  text not null,
  city          text not null,
  state         text not null,
  timezone      text,
  website       text,
  service       text not null,
  line_type     text not null,
  trade         text not null,
  export_batch  text,
  exported_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists cold_sms_leads_available
  on public.cold_sms_leads (state, city, company_name) where exported_at is null;
create index if not exists cold_sms_leads_batch
  on public.cold_sms_leads (export_batch) where export_batch is not null;

alter table public.cold_sms_leads enable row level security;

create or replace view public.cold_sms_lead_groups with (security_invoker = true) as
  select city, state, line_type, service, count(*)::int as available
  from public.cold_sms_leads
  where exported_at is null
  group by city, state, line_type, service;

create or replace view public.cold_sms_lead_batches with (security_invoker = true) as
  select export_batch as batch, min(exported_at) as exported_at, count(*)::int as leads
  from public.cold_sms_leads
  where export_batch is not null
  group by export_batch;

-- p_cities are "City|ST" keys (two states share city names). An empty or null
-- array means no filter. p_batch null = preview only; set = stamp and return.
create or replace function public.cold_sms_leads_pick(
  p_cities     text[],
  p_line_types text[],
  p_services   text[],
  p_limit      int,
  p_batch      text default null
) returns jsonb
language plpgsql
as $$
declare
  picked jsonb;
begin
  with chosen as (
    select l.phone
    from public.cold_sms_leads l
    where l.exported_at is null
      and (coalesce(cardinality(p_cities), 0) = 0 or (l.city || '|' || l.state) = any (p_cities))
      and (coalesce(cardinality(p_line_types), 0) = 0 or l.line_type = any (p_line_types))
      and (coalesce(cardinality(p_services), 0) = 0 or l.service = any (p_services))
    order by l.state, l.city, l.company_name, l.phone
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  ),
  stamped as (
    update public.cold_sms_leads l
       set export_batch = p_batch, exported_at = now()
      from chosen c
     where p_batch is not null and l.phone = c.phone
    returning l.*
  ),
  result as (
    select * from stamped
    union all
    select l.* from public.cold_sms_leads l join chosen c on c.phone = l.phone
     where p_batch is null
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.state, r.city, r.company_name, r.phone), '[]'::jsonb)
    into picked
    from result r;
  return picked;
end;
$$;

create or replace function public.cold_sms_leads_in_batch(p_batch text) returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.state, l.city, l.company_name, l.phone), '[]'::jsonb)
  from public.cold_sms_leads l
  where l.export_batch = p_batch;
$$;

revoke all on public.cold_sms_lead_groups, public.cold_sms_lead_batches from anon, authenticated;
revoke all on function public.cold_sms_leads_pick(text[], text[], text[], int, text) from public, anon, authenticated;
revoke all on function public.cold_sms_leads_in_batch(text) from public, anon, authenticated;
