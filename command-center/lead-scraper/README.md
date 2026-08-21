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

## Pressing Go is the whole job

Install the watcher once and the app's Go button is enough:

    .\install-watcher.ps1            install it, start it now
    .\install-watcher.ps1 -Status    is it up, and what did it last say
    .\install-watcher.ps1 -Uninstall remove it

It registers a scheduled task that starts `run.ps1 --watch` at logon, restarts it if
it dies, and appends everything to `logs\watcher.log`. Queue a run from Leads and it
is claimed within 10 seconds.

The app cannot do this on its own and never will: it is a Cloudflare worker in a
datacentre and the scraper is a process on your machine. Pressing Go queues a run;
something local has to be listening. This is that something.

Two traps are already paid for, and both are load-bearing:

  * **The task redirects through `cmd.exe`, not PowerShell.** `run.ps1` sets
    `$ErrorActionPreference = "Stop"`, and PowerShell 5.1 turns anything a native
    program writes to stderr into a terminating error when it is the one capturing
    the stream. The first install died on its own off switch, mid-sentence. One
    "poll failed" on a dropped connection would have done the same.
  * **`.stop` idles the watcher, it does not stop the process.** A service that
    exits is a service the scheduler restarts, forever.

`data/.stop` is the off switch. While that file exists no run scrapes anything,
whoever starts it and however. What is in the file is the reason, printed on refusal.
Delete it to scrape again; a stopped run resumes from the queue exactly where it stood.

Getting numbers out:

    python export_sms.py --niche windows_doors --dry-run   # see the batch, stamp nothing
    python export_sms.py --niche windows_doors             # write it and stamp it

**A trade has to be named.** The table holds every trade this has ever hunted,
including retired ones, and an unscoped export mixes them: in August 2026 the
best-scoring pending rows were HVAC, a trade dropped months earlier, sitting above
the windows leads in the same CSV. `--all-niches` still exists and has to be typed.

After any change to a word list or to the scoring, bring the stored rows up to date:

    python regrade.py --dry-run     # what would change
    python regrade.py               # do it, after writing data/regrade_undo.json

Regrade never deletes. A row that now fails is stamped through `send_status` so it
leaves the export pool while staying on the page, and a row that has already been
queued or sent is never touched, because re-grading does not rewrite history.

## Somebody asks not to be contacted

One command. It is permanent, and it reaches both halves: the file the CSV exporter
reads offline, and the `send_status` stamp the app, the send paths and the power
dialer read.

    python suppress.py +12065550142        add a number
    python suppress.py --file numbers.txt  one per line
    python suppress.py --list              what is on the list
    python suppress.py --sync              pull the app's opt-outs into the file

Unlike a regrade, this is written over ANY status, including a number already sent.
An opt-out outranks everything else the table can say about a number. `data/suppression.txt`
is tracked in git on purpose: losing it means texting somebody who already opted out.

## The pieces

| File | What it is |
| --- | --- |
| `niche.py` | The deny-first scored qualifier. The centerpiece. |
| `niches/*.json` | The word lists. A new niche is data, not code. |
| `pipeline.py` | Normalize, score, merge-upsert. The only writer of the leads table. |
| `run_maps.py` | The gosom wrapper, native or Docker, with block detection. |
| `build_queue.py` | The resumable keyword x location queue. |
| `fallback.py` | Houzz/Manta top-up when a metro comes back thin. |
| `suppress.py` | The do-not-contact list, and the command that adds to it. |
| `linetype.py` | Mobile or landline per NPA-NXX, from NANPA's free block data. |
| `backfill_line_type.py` | Stamps `line_type` on leads scraped before the column existed. |
| `export_sms.py` | Score-qualified CSV batches, best first, one trade at a time. |
| `regrade.py` | Re-scores stored leads through the current rubric. |
| `install-watcher.ps1` | Registers the runner as a logon task, so pressing Go is enough. |
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

Then two gates that ask the opposite question, because a deny list can only name what
somebody already thought of:

* **To be kept at all**, a row needs a niche signal: a core category, or a trade word
  in the name. Weak words ("home", "services", "pro") are noise every trade shares and
  never qualify anything on their own. Without this, a dentist with a website and a
  4.8 rating scored 35 and was stored, because nothing in any list says "dentist".
* **To be exported**, a row needs a core category. Google has to call them the trade;
  their own signage is not enough. Reviews, rating and website are worth 35 to any
  business alive, so a single trade word in a name used to be worth exactly the 15
  that tipped it over 50. That is how window tinting shops reached a windows list.

Both were found on 2026-08-20, which is what `data/.stop` was about.

## The niches

One button per trade in the wizard:

| Niche | What it hunts |
| --- | --- |
| `roofing` | Roofers, roof replacement, storm damage |
| `remodeling` | Kitchen, bath, whole-home, additions |
| `siding_windows` | Siding, gutters, insulation |
| `windows_doors` | Replacement windows, entry and patio doors |
| `general_contracting` | GCs, custom home builders |
| `home_services` | The catch-all: all of the above at once |

**Editing a file in `niches/` changes nothing in the app until it is seeded.**
The wizard reads the `lead_niche_presets` table, not this folder; these files are
only the source it is seeded FROM. After adding, editing or deleting a niche:

    node ../app/scripts/seed-niches.mjs

The seed upserts and never prunes, so a niche you DELETE here keeps being offered
in the wizard until its row is removed from that table by hand. The standalone
`python coordinator.py --local` path reads this folder directly, which is why a
change can look applied on the command line while the wizard still shows the old
list.

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

## Mobiles only

Every lead is stamped `wireless`, `landline` or `unknown` at scrape time, and both
send paths (the CSV export and the Leads page's send) refuse anything that is not a
mobile. A landline is still stored and still visible under the "Everything" filter;
it simply cannot be put on a list.

The answer comes from NANPA's free public file of who owns each six-digit NPA-NXX
block. NANPA does not publish a wireless flag, so `linetype.py` derives one from the
carrier name. Two limits come with the price: it works per block rather than per
number, and it cannot see a number that has been ported between carriers. Roughly 70
to 80% right, which is the trade for free and for no per-lookup cost.

The map is committed as `data/npanxx_line_type.txt.gz`, so a scrape never touches the
network for it. NANPA rebuilds their file daily; refresh ours whenever it feels stale:

    .venv/bin/python linetype.py --refresh
    .venv/bin/python backfill_line_type.py     # re-stamp blocks that changed hands

Check one number with `.venv/bin/python linetype.py +15551234567`.

## A note on sending and compliance

This system sources numbers, it does not send. Line type is screened here, before a
number ever reaches a list; the SMS platform still handles opt-outs and throttling.
Cold SMS is regulated: check the rules for the states you text into, honour opt-outs
immediately, and keep volume sane. The cleaner the targeting, the fewer wrong people
get contacted, and the longer the sending stays healthy.
