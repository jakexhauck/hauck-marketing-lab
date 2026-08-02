-- 0080: the 1000 biggest US cities, and what we have already done in each.
--
-- Seeded from Jake's cities spreadsheet (rank, city, state, population, growth).
-- The sheet is the SEED, not the system: once imported, the app owns the list so
-- it can be sorted, filtered and joined to scrape history without a Sheets call
-- on every page load, and so a renamed tab or a moved file cannot blank the page.
--
-- Status is NOT a column. It is computed on read from two independent facts:
--
--   targeted  the city appears in a scrape_runs.cities array
--   leads     a row in cold_sms_outreach_numbers carries that city
--
-- They genuinely disagree, which is the whole point of showing both. A run that
-- targeted Denver and found nothing leaves targeted=1, leads=0; storing one
-- "scraped" flag would have thrown that away and made a worked-and-empty city
-- look identical to an untouched one. Nothing is written back, so a re-scrape or
-- a deleted run corrects the page by itself.
--
-- Run AFTER 0001..0079. Additive and idempotent: safe to re-run.

create table if not exists public.lead_cities (
  id uuid primary key default gen_random_uuid(),

  -- The sheet's own rank, by population. Kept because it is the order Jake
  -- reads the list in, and it is stable in a way population is not.
  rank int not null,
  city text not null,
  -- Both spellings are stored. The sheet says "Michigan"; the scraper's rows say
  -- "MI"; lead_metros says "MI". Keeping the pair here means the join can accept
  -- either without a lookup table living in three places.
  state_name text not null,
  state_code text not null,

  population int,
  growth_pct numeric,

  created_at timestamptz not null default now(),

  -- A city name is only unique within its state: there is a Portland in both
  -- Oregon and Maine, and both are in this list.
  unique (city, state_code)
);

alter table public.lead_cities enable row level security;

create index if not exists lead_cities_rank_idx on public.lead_cities (rank);
create index if not exists lead_cities_state_idx on public.lead_cities (state_code, rank);

comment on table public.lead_cities is
  'The 1000 biggest US cities, seeded from Jake''s spreadsheet. Read by the admin Leads > Cities tab. Holds no status: coverage is computed from scrape_runs and cold_sms_outreach_numbers on every read.';
comment on column public.lead_cities.state_code is
  'Two-letter code, derived from state_name at seed time. This is what joins to lead_metros.state and to a scraped lead''s state.';

-- ---------------------------------------------------------------------------
-- How many leads we hold per city, per niche.
--
-- A view rather than a query in the Worker: the leads table is the biggest one
-- here and grouping it in Postgres returns a few thousand rows instead of
-- shipping every lead to a Worker to be counted in JavaScript.
--
-- Keys are lowercased and trimmed on this side so the caller compares like with
-- like. The state is left as it was written rather than normalised to a code:
-- the column holds "MI" in some rows and "Michigan" in others depending on what
-- Google returned, so the caller matches against either spelling.
-- ---------------------------------------------------------------------------

create or replace view public.lead_city_counts as
  select
    lower(btrim(city))                   as city_key,
    lower(btrim(coalesce(state, '')))    as state_key,
    coalesce(niche_id, '')               as niche_id,
    count(*)                             as leads
  from public.cold_sms_outreach_numbers
  where city is not null
    and btrim(city) <> ''
  group by 1, 2, 3;

comment on view public.lead_city_counts is
  'Lead counts per city per niche, for the Cities tab. Grouped in Postgres so the Worker never pulls the whole leads table to count it.';
