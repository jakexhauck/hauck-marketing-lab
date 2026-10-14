-- 0035: Cold Call daily dialing funnel (Acquisition > Cold Call).
--
-- Agency-global: NO tenant_id. Jake's own dialing numbers, hand-entered one row
-- per calendar day. The app DB is the source of truth; no dialer/GHL auto-fill
-- in Phase 1.
--
-- One row per day, keyed by `day` (unique) so the tracker can upsert a single
-- cell edit without reading first. Rates (pickup %, pickup -> pass-through %,
-- pitch -> book %) are COMPUTED in src/lib/coldCall.ts and never stored: storing
-- a derived rate lets it drift from its inputs.
--
-- Run AFTER 0001..0034. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions (RLS on, no policies).

create table if not exists public.cold_calls (
  id              uuid primary key default gen_random_uuid(),
  day             date not null unique,
  -- Inputs. Nullable so a blank cell stays blank rather than a fabricated 0.
  calls_made      integer,
  pickups         integer,
  pass_through    integer,
  meetings_booked integer,
  objections      text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The tracker always reads a month window: [first, last] of the viewed month.
create index if not exists cold_calls_day_idx
  on public.cold_calls (day desc);

alter table public.cold_calls enable row level security;
-- No policies: service-role only.
