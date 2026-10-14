-- 0069: the lead scraper's tables.
--
-- Acquisition > Leads is a window onto the LIIGO SOP's scraper, which lives at
-- command-center/lead-scraper. The engine is ported whole and unchanged; this
-- migration gives it somewhere to write inside the Command Center's database so
-- the page can read the results without a second data source to keep straight.
--
-- cold_sms_outreach_numbers is the SOP's table, name and all, recreated column for
-- column. The unique constraint on phone_e164 is not decoration: it is what makes
-- the whole pipeline idempotent. The scraper upserts on it, so re-scraping a
-- business enriches its row (fresh rating, reviews, website, score) instead of
-- duplicating it, and a run can be killed and restarted without creating a mess.
--
-- Four columns are ours rather than the SOP's, and all four are additive:
--   niche_id  which niche definition scored this row, so two niches can share a
--             table without their scores being compared to each other
--   run_id    the most recent run that surfaced this lead. Run history counts come
--             from scrape_runs' own tallies, never from counting these rows, so a
--             re-discovered lead moving to a newer run costs the history nothing
--   in_crm    true when the phone was already in GoHighLevel when the run started.
--             The row is still stored and still enriched, exactly as the SOP does;
--             the Leads page simply never renders it. Hiding at read time rather
--             than dropping at write time means the overlap stays measurable
--   sent_to   which channel it was handed to, so the table can answer "did this
--             one go to the dialer or the SMS list" after the fact
--
-- send_status is deliberately untouched by the scraper's merge path: a re-scrape
-- must never resurrect a number that has already been handed to a channel.
--
-- Run AFTER 0001..0068. Additive and idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- The SOP's leads table.
-- ---------------------------------------------------------------------------

create table if not exists public.cold_sms_outreach_numbers (
  id uuid primary key default gen_random_uuid(),
  business_name text,
  phone_e164 text unique not null,
  phone_raw text,
  line_type text,
  niche_confidence text,
  website text,
  address text,
  city text,
  state text,
  metro text,
  source text,
  primary_type text,
  send_status text not null default 'pending',
  sourced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- scoring + enrichment columns:
  categories jsonb,
  rating numeric,
  review_count int,
  icp_score numeric,
  icp_flags jsonb,
  scored_at timestamptz,
  source_keyword text
);

-- Ours, added separately so the block above stays a literal copy of the SOP's.
alter table public.cold_sms_outreach_numbers
  add column if not exists niche_id text,
  add column if not exists run_id uuid,
  add column if not exists in_crm boolean not null default false,
  add column if not exists sent_to text,
  add column if not exists sent_at timestamptz;

alter table public.cold_sms_outreach_numbers enable row level security;

-- The SOP's three indexes, unchanged.
create index if not exists idx_send_status
  on public.cold_sms_outreach_numbers (send_status);
create index if not exists idx_metro
  on public.cold_sms_outreach_numbers (metro);
create index if not exists idx_icp
  on public.cold_sms_outreach_numbers (send_status, icp_score desc);

-- The Leads table is read as "this run, not already in the CRM, best score first".
create index if not exists cold_sms_outreach_numbers_run_idx
  on public.cold_sms_outreach_numbers (run_id, icp_score desc)
  where in_crm = false;

create index if not exists cold_sms_outreach_numbers_niche_idx
  on public.cold_sms_outreach_numbers (niche_id, send_status, icp_score desc);

comment on table public.cold_sms_outreach_numbers is
  'The LIIGO SOP''s scored leads table, written only by lead-scraper/pipeline.py. phone_e164 is unique so the pipeline is idempotent and a re-scrape enriches rather than duplicates.';
comment on column public.cold_sms_outreach_numbers.icp_flags is
  'Why this row scored what it did (matched category, name signals, website, review band). Surfaced on the Leads page so a bad pull is diagnosable rather than a mystery.';
comment on column public.cold_sms_outreach_numbers.in_crm is
  'The phone was already in GoHighLevel when the run started. Stored and enriched as normal; hidden by the Leads page.';
comment on column public.cold_sms_outreach_numbers.send_status is
  'pending until handed to a channel, then a batch label. Never included in the scraper''s merge payload, so a re-scrape cannot resurrect a sent number.';

-- ---------------------------------------------------------------------------
-- The wizard's runs. One row per press of Go.
-- ---------------------------------------------------------------------------

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),

  -- what was asked for
  niche_id text not null,
  niche_label text,
  niche_spec jsonb,               -- the full word lists, frozen at queue time so a
                                  -- later preset edit cannot rewrite this run's history
  states jsonb not null default '[]'::jsonb,
  cities jsonb not null default '[]'::jsonb,
  size text not null default 'standard',
  proxies text,

  -- where it is
  --   preparing = the app is taking the GoHighLevel phone snapshot
  --   queued    = ready for a runner to claim
  status text not null default 'preparing',
  host text,                               -- which machine claimed it, Mac or PC
  error text,

  -- How complete the duplicate check was for this run. Recorded rather than
  -- assumed: if the GoHighLevel sweep hit its page cap or failed outright, the
  -- run still goes ahead, but the page must be able to say the hiding was
  -- partial instead of quietly implying every duplicate was caught.
  crm_snapshot_count int not null default 0,
  crm_snapshot_partial boolean not null default false,

  -- what happened. The runner pushes these as it goes; the page's bar reads them.
  total_queries int not null default 0,
  done_queries int not null default 0,
  raw_found int not null default 0,
  kept_count int not null default 0,
  new_count int not null default 0,
  in_crm_count int not null default 0,
  excluded_count int not null default 0,
  sent_count int not null default 0,
  pass_rate numeric,
  failure_rate numeric,
  blocked boolean not null default false,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.scrape_runs enable row level security;

-- The runner claims the oldest queued run; the page lists newest first.
create index if not exists scrape_runs_queued_idx
  on public.scrape_runs (created_at asc)
  where status = 'queued';
create index if not exists scrape_runs_recent_idx
  on public.scrape_runs (created_at desc);

comment on table public.scrape_runs is
  'One row per wizard run. The runner claims queued rows atomically, so the Mac and the PC can both watch without doing the same work twice.';
comment on column public.scrape_runs.niche_spec is
  'The word lists as they read when Go was pressed. Frozen on purpose: editing a preset later must not rewrite what an old run actually searched for.';
comment on column public.scrape_runs.pass_rate is
  'kept / raw. The SOP''s niche pass rate: the single best read on whether the targeting is working.';

-- ---------------------------------------------------------------------------
-- Saved niches. Jake types a niche once; it becomes a button.
-- ---------------------------------------------------------------------------

create table if not exists public.lead_niche_presets (
  id uuid primary key default gen_random_uuid(),
  niche_id text unique not null,
  label text not null,
  spec jsonb not null,
  built_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_niche_presets enable row level security;

comment on table public.lead_niche_presets is
  'Niche word lists saved from the wizard. built_in rows ship with the runner (niches/*.json) and are seeded rather than authored.';

-- ---------------------------------------------------------------------------
-- The metro grid: every state's main metros and their affluent suburb rings.
-- ---------------------------------------------------------------------------
--
-- The runner owns this as data/metros.json; the wizard needs the same list to
-- offer "these are the wealthy suburbs in Texas, strike out the ones you don't
-- want". Seeded from that one file by scripts/seed-niches.mjs rather than copied
-- into the app, so there is exactly one place a city is written down.

create table if not exists public.lead_metros (
  id uuid primary key default gen_random_uuid(),
  metro text not null,
  state text not null,
  query_anchor text not null,
  rank int not null default 99,
  tier int not null default 2,
  suburbs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (metro, state)
);

alter table public.lead_metros enable row level security;

create index if not exists lead_metros_state_idx
  on public.lead_metros (state, rank);

comment on table public.lead_metros is
  'Seeded from lead-scraper/data/metros.json. The wizard reads it to propose a state''s cities; the runner reads the file. One source, two readers.';

-- ---------------------------------------------------------------------------
-- The GoHighLevel phone snapshot.
-- ---------------------------------------------------------------------------
--
-- Jake asked for duplicates to be hidden entirely. Checking every scraped row
-- against GoHighLevel live would be thousands of API calls per run and would hit
-- rate limits, so the app pulls the contact phone list once when a run is created
-- and drops it here. The runner reads the whole table into memory and filters
-- against it, which is one API sweep per run rather than one per lead.

create table if not exists public.lead_crm_phone_cache (
  phone_e164 text primary key,
  refreshed_at timestamptz not null default now()
);

alter table public.lead_crm_phone_cache enable row level security;

comment on table public.lead_crm_phone_cache is
  'Every phone already in GoHighLevel, refreshed once per run. Read in bulk by the runner so duplicate detection costs one API sweep, not one call per lead.';
