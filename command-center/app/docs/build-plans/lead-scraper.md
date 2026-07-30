# Lead Scraper — Acquisition > Leads

Agency prospecting. A free Google Maps scraper that fills a scored leads table, with
a wizard front end in the Command Center and a one-click hand-off into Cold Call or
SMS as tagged GHL contacts.

Source of the engine: `LIIGO_Lead_Scraper_Guide_v2_2026-07-10.pdf` (Part 2, the build
plan). **Jake's constraint: the scraping function must be identical to the SOP.** The
engine is ported, not reinvented. Only the niche word lists change (landscaping ->
home services, which the SOP itself prescribes) and the export step gains a GHL path
alongside the CSV it already writes.

## Decisions (locked with Jake, 2026-07-30)

| Question | Answer |
| --- | --- |
| Who is it for | The agency's own prospecting, not a client feature |
| Page | Acquisition > **Leads**, a third tab beside Cold Call and SMS |
| Niche input | Free text; presets accumulate as Jake saves them |
| First niche | Home services (roofing, HVAC, remodel) |
| Geography | Tick states, then either hand-pick cities or let the app propose the state's wealthiest suburbs |
| Rule review | None. "Just run it" — no pre-flight approval of keywords/deny list |
| Run size | Quick / Standard / Deep, chosen per run |
| Progress | Progress bar, results at the end |
| Duplicates | Hidden entirely; GHL contact list pulled once at run start and filtered in memory |
| Leftovers | Untransferred leads stay in the table indefinitely |
| Approval | Tick and send. Nothing moves without Jake |
| Destination | Jake picks Cold Call or SMS per send |
| GHL tags | state, city, niche, source-scraper, batch date, score band |
| History | Run list with niche, states, found / kept / sent counts |
| CSV | Kept as a download button |
| Database | The app's Supabase, using the SOP's exact table shape |
| Engine location | Local runner on both the Mac and the PC, both writing to the same database |

### Naming caveat, raised and overruled

Acquisition previously had a Leads tab that was deliberately folded into Cold Call
(see `src/lib/adminPillars.ts`) because two lead lists meant two answers to "which
list is the real one". Jake was told and chose **Leads** anyway. Mitigation: the Cold
Call book stays the only list you dial from. The Leads tab is explicitly a sourcing
table that empties into it, and the UI copy must say so.

### "Just run it" caveat

With no pre-flight review of the generated keywords and deny list, a badly targeted
pull is only visible after the fact. Mitigation: every row carries `icp_flags`, the
reasons behind its score, surfaced in the table. A junk pull is then diagnosable at a
glance, and the fix is editing the rules and re-running.

## What must survive from the SOP, verbatim

This list is the acceptance criteria for the engine. Any deviation is a bug.

**Sourcing**
- gosom (`github.com/gosom/google-maps-scraper`) as the Maps engine, invoked with `-json`
- Native Go binary preferred, Docker fallback, engine choice read from `data/.engine` or `LEADS_ENGINE`
- Resumable queue of keyword x location rows, idempotent merge (re-running keeps `done` rows, only adds new pending ones)
- Two passes per metro: metro anchors first, then suburb rings for tier-1 metros
- Houzz / Manta fallback via Scrapling when a metro's first pass yields under ~15 qualified
- Backoff: read `failure_rate` after each batch; above 0.20 drop concurrency and retry once with a longer inactivity timeout

**Qualifier (`niche.py`) — deny first, score the survivors, prove the floor**
- Deny terms scanned against the business **name and every category**, not just the primary
- Venue words (restaurant, cafe, church, school, hotel...) are category-only, so "Coffee County Roofing" survives
- Ambiguous short words (pool, spa, store) require a whole-word match, so "Whirlpool" and "Storey" don't false-trip
- Recurring-service look-alikes are a separate hard-drop list from the general deny list
- Hard drops: off-niche primary category, review count over `MAX_REVIEWS` (120, franchise scale), toll-free numbers
- Scoring: core primary category +40, core secondary +30 (not stacked), name signals +15 each capped at +30, weak signals +5 total, review count 1-80 +15, rating >= 4.3 +10, live website +10, no website and no reviews -15, certified directory +20
- `EXPORT_THRESHOLD = 50`
- **The floor is proven by construction**: a bare category match with nothing else must land below 50, forcing at least one independent signal
- Verdicts: `drop` is discarded, `low` is stored but never exported, `pass` exports

**Storage (`pipeline.py`, the only DB writer)**
- Phones normalised to E.164 via `phonenumbers`, invalid numbers discarded
- `phone_e164` unique constraint makes the pipeline idempotent
- Merge-upsert enriches an existing row with the fresh scrape and a fresh score
- `None` values stripped before upsert, so a merge never overwrites data with NULL
- `send_status` never appears in the upsert payload, so a merge cannot clobber send-batch state
- Rows grouped by key set before POST (PostgREST needs uniform keys per request)

**Export (`export_sms.py`)**
- Pulls `send_status = 'pending'` and `icp_score >= 50`, ordered best score first
- Re-validates each phone, drops anything in the suppression file, dedupes, requires a business name
- Batches capped at 1000 rows
- Writes to `.csv.part`, stamps `send_status`, then promotes to `.csv` — never the other order
- `--dry-run` stamps nothing

**Suppression (`suppress.py`)**
- Permanent, file-backed, no env or DB dependency
- A phone in the file never exports again regardless of score, status or requalification

**The regression test**
- ~20 look-alikes we never want, each given the maximum favourable soft signals, all asserted below threshold
- A few ideal customers asserted above it
- This is what stops a future word-list edit from quietly re-opening the junk gate

## Architecture

Three pieces.

### 1. The runner (local, Python, on the Mac and the PC)

Lives at `command-center/lead-scraper/`. A near-verbatim port of the SOP's Python
modules: `niche.py`, `pipeline.py`, `run_maps.py`, `build_queue.py`, `suppress.py`,
`export_sms.py`, plus a coordinator. Cross-platform (Python 3.11+ and either a Go
toolchain or Docker, both available on macOS and Windows).

Two deltas from the SOP, both additive:
- `niche.py` word lists are home services, and are loaded from a niche definition
  rather than hardcoded, so a new niche is data not code
- The coordinator reports progress to the app and reads its job queue from the app,
  instead of only reading a local `queue.jsonl`

### 2. The database (the app's Supabase)

One new migration, `0070_lead_scraper.sql`, creating the SOP's table shape verbatim
(`business_name`, `phone_e164` unique, `phone_raw`, `line_type`, `niche_confidence`,
`website`, `address`, `city`, `state`, `metro`, `source`, `primary_type`,
`send_status`, `sourced_at`, `categories`, `rating`, `review_count`, `icp_score`,
`icp_flags`, `scored_at`, `source_keyword`) plus:
- a `scrape_runs` table (niche, states, cities, size, status, counts, timestamps)
- a `run_id` column on the leads table so the run history can count
- a `niche_presets` table for the saved niches

The SOP's indexes are carried over unchanged, including `(send_status, icp_score desc)`.

### 3. The app (Acquisition > Leads)

- **Wizard**: niche (text + saved presets), states, city mode (hand-pick or propose
  wealthiest suburbs), run size, go
- **Progress**: a bar while the run is live, polled from `scrape_runs`
- **Results table**: business, phone, city, state, score with its flags, rating,
  review count, website link. Best score first. Already-in-GHL rows never rendered
- **Send**: tick rows, pick Cold Call or SMS. Creates the tagged GHL contact via the
  existing `functions/lib/agencyCrm.ts` upsert and drops the lead into that surface
- **CSV**: a download button running the SOP's export path
- **History**: past runs with their counts

## Open items for the build

- Whether the runner talks to the app over its API or writes to Supabase directly
  (leaning direct, matching the SOP, with the app polling)
- The "wealthiest suburbs" proposal source for each state
- Windows setup script parity with the macOS one
