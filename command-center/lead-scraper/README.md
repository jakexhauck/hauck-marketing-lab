# Lead scraper (the runner)

The SOP's free Google Maps scraper, ported whole. It finds operators in a target
niche, denies the obvious misses, scores the survivors, and writes them into the
Command Center's database. It sources numbers. It does not send anything.

The Leads page in the app (Acquisition > Leads) is a window onto this. The engine
here is the product; the page is the mask.

## Setup

    # macOS
    bash setup_mac.sh

    # Windows (PowerShell)
    .\setup_windows.ps1

Then fill in `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

gosom needs either a Go toolchain or Docker. The setup script installs it if it
finds one and tells you loudly if it does not.

## Running

    bash run.sh --watch          # poll for runs queued from the Leads page
    bash run.sh --run <id>       # execute one run
    bash run.sh --local          # the SOP's standalone queue.jsonl mode

`--watch` is the normal mode: leave it running, hit Go in the app, and it picks the
job up. Runs are claimed atomically, so the Mac and the PC can both watch without
doing the same work twice.

## The pieces

| File | What it is |
| --- | --- |
| `niche.py` | The deny-first scored qualifier. The centerpiece. |
| `niches/*.json` | The word lists. A new niche is data, not code. |
| `pipeline.py` | Normalize, score, merge-upsert. The only writer of the leads table. |
| `run_maps.py` | The gosom wrapper, native or Docker, with block detection. |
| `build_queue.py` | The resumable keyword x location queue. |
| `fallback.py` | Houzz/Manta top-up when a metro comes back thin. |
| `suppress.py` | Permanent, file-backed exclusion. |
| `export_sms.py` | Score-qualified CSV batches, best first. |
| `coordinator.py` | Walks the queue, backs off when throttled, reports progress. |
| `store.py` | The run queue and the CRM phone snapshot. Never touches leads. |

## The qualifier, in one paragraph

Deny first: kill the obvious misses by checking the deny list against the business
**name and every category**, not just the primary one. Then hard-drop off-niche
primary categories, franchise-scale operators (120+ reviews) and toll-free numbers.
Then score what survives: a core category is worth 40, name signals 15 each capped
at 30, a real review footprint 15, a good rating 10, a live website 10, and an
operator with no website and no reviews loses 15. Only rows at or above 50 export.
The numbers are set so a bare category match with nothing else cannot reach 50,
which forces at least one independent signal before anything can be contacted.

## The niches

One button per trade in the wizard:

| Niche | What it hunts |
| --- | --- |
| `roofing` | Roofers, roof replacement, storm damage |
| `hvac` | Heating, cooling, furnace, heat pump |
| `remodeling` | Kitchen, bath, whole-home, additions |
| `siding_windows` | Siding, replacement windows, gutters, insulation |
| `general_contracting` | GCs, custom home builders |
| `home_services` | The catch-all: all of the above at once |

`_shared.json` is not a niche. It holds the parts every trade wants (the venue
words, the whole-word guards, the retail/supply and off-trade rejections) and each
trade `extends` it, so a hole gets fixed in one place. A leading underscore keeps it
out of the wizard.

**Trades are separated by PRIMARY CATEGORY, never by name.** Roofing denies
`hvac contractor` as a primary business class, but never denies the word
"remodeling" on a business name, because "Rob's Roofing & Remodeling" is a roofer
and exactly who you want. `tests/test_trades.py` pins this down; if someone later
"tidies up" by moving a sibling trade into the deny list, that test fails.

## Pointing it at a new niche

Copy `niches/roofing.json`, change four things, leave the machine alone:

1. `keywords` - what customers type to find someone like you
2. `allow_core` - Google categories that can only mean your kind of work
3. `deny` - the look-alikes, recurring-service versions and supply/retail you never want
4. `name_signals` - the words in a business name that suggest a real operator

Then run the regression test and add your own look-alikes to it.

## The test

    .venv/bin/python -m unittest discover -s tests -v

`tests/test_niche.py` takes two dozen businesses we never want, gives each one the
maximum favourable signals (live website, 5.0 rating, healthy review count) and
asserts every single one still fails to export. This is what stops a future
word-list edit from quietly re-opening the junk gate. Keep it green.

## A note on sending and compliance

This system sources numbers. It does not send. The SMS platform handles line-type
screening, opt-outs and throttling. Cold SMS is regulated: check the rules for the
states you text into, honour opt-outs immediately, and keep volume sane. The cleaner
the targeting, the fewer wrong people get contacted, and the longer the sending
stays healthy.
