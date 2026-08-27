"""The coordinator: walk the queue, scrape each metro batch, score and store.

Resumable, exactly as the SOP is: queue rows flip to 'done' and are saved after
every batch, so stopping and restarting picks up where it left off.

Carries the SOP's step 7 hardening rather than the minimal version:
  * block handling  - failure_rate over 0.20 drops concurrency and retries once with
                      a longer inactivity timeout; three bad metros in a row with no
                      proxies pauses Maps, notes it in logs/blocker.txt, and lets the
                      directory fallback carry on
  * thin-metro      - under 15 qualified in a metro's first pass queues a Houzz/Manta
                      top-up for that city, insert-only
  * run summary     - totals, new this run, the niche pass rate (kept / raw) and
                      the send rate (sendable / raw), which is the one that says
                      how many of the leads a run found can go on a list today

Three ways in:
    python3 coordinator.py --watch        poll for runs the wizard queued
    python3 coordinator.py --run <id>     execute one run
    python3 coordinator.py --local        the SOP's standalone queue.jsonl mode
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import build_queue
import fallback
import niche as niche_mod
import pipeline
import run_maps
import store

WD = Path(__file__).resolve().parent
DATA = WD / "data"
LOGS = WD / "logs"
BATCH = 40                    # queue rows per metro batch (the SOP's number)
BLOCK_THRESHOLD = 0.20        # failure_rate above this = Google is pushing back
BAD_METROS_BEFORE_PAUSE = 3

# How hard to push Google, and how long to wait for it to go quiet.
#
# Both were measured on 27 August rather than guessed. The scraper is network
# bound, not compute bound: the machine sits at 3% CPU with four workers going,
# so four was leaving the line half empty. Against that, observed failure rates
# across a week of runs were 0.0 to 0.05 with BLOCK_THRESHOLD at 0.20, and the
# maps-paused guard has never once fired, which is the headroom that makes eight
# defensible.
#
# The inactivity timer is the tail. Per-call time is bimodal: a median of 54s
# and a p90 of 240s, and 240 is exactly two of the old two-minute windows. Those
# are calls that finished and then sat waiting for a result that was never
# coming. A minute is still four times the median call.
#
# If Google does start pushing back, the backoff below catches it and the run
# pauses rather than being blocked outright. Turn these back down before
# reaching for proxies.
CONCURRENCY = 8
INACTIVITY = "60s"

# Picking a run back up after the runner died under it.
#
# The watcher is a Windows LOGON task, so it dies whenever the PC restarts or
# Jake logs out. The run it was working is left reading 'running', and
# claim_next_run only ever takes 'queued': the watcher comes back at logon, sees
# an empty queue, and idles for the rest of the day while the Leads page shows a
# scrape in progress and the wizard refuses to start another one. On 26 August
# that cost 9.5 hours out of a 16.7 hour run, and it is where nearly all the
# scraper's missing time has gone.
#
# STALE_AFTER has to clear the slowest honest keyword, with room to spare. A
# keyword that trips the block backoff costs its own call, then 30s, then a retry
# that can sit on a five minute inactivity timer: about eight minutes at worst.
# Twenty is two and a half times that. Erring long is nearly free, because the
# hole this fills is measured in hours; erring short would yank a run out from
# under a runner that is still working, and put two of them on the same queue.
REAP_STALE_AFTER = 20 * 60
REAP_EVERY = 60

# The off switch. `data/.stop` present means no run scrapes anything, whoever
# starts it and however it is started. Checked at the top of a job AND before
# every batch, because the thing that needed stopping was a run already going,
# relaunched by a background task whose owner was not at the keyboard. Killing
# the process only worked until something typed the command again.
#
# Delete the file to scrape again. Nothing else about a run changes: the queue
# on disk still holds every done row, so a stopped run resumes where it stood.
STOP_FILE = DATA / ".stop"


def stopped():
    """Why the scraper is off, or None. The reason is whatever is in the file."""
    if not STOP_FILE.exists():
        return None
    # utf-8-sig, not utf-8: Notepad and PowerShell's Set-Content both write a byte
    # order mark, and this file is meant to be created by hand in a hurry. Reading
    # it as plain utf-8 put a literal ﻿ in front of the reason in the log.
    return STOP_FILE.read_text(encoding="utf-8-sig", errors="replace").strip() or "stopped by hand"


def cancelled_in_app(run_id):
    """True when Stop was pressed on the page. The run row is the authority.

    There is no second switch to read and no new column: the app ends a run by
    writing 'cancelled' on the row, so a row that is no longer 'running' is a run
    somebody stopped. A row that has vanished counts too, since scraping into a
    run that no longer exists writes leads keyed to nothing.

    This is NOT data/.stop and the difference matters. That file is Jake's own
    switch on this machine and it PAUSES: the run goes back on the queue and
    resumes when the file is deleted. Stop on the page ends the run, and the row
    must be left exactly as the app wrote it.

    A database that cannot be reached answers "not cancelled" and the next
    keyword asks again. A blip must never end an hour-long run.
    """
    if not run_id:
        return False
    try:
        row = store.get_run(run_id)
    except Exception as e:
        print(f"  (could not check whether the run was stopped: {e})", file=sys.stderr)
        return False
    if row is None:
        print("  the run row is gone; stopping")
        return True
    return row.get("status") != "running"


class Progress:
    """Running totals, pushed to scrape_runs so the page's bar means something."""

    def __init__(self, run_id, total_queries):
        self.run_id = run_id
        self.total = total_queries
        self.done = 0
        self.raw = 0
        self.kept = 0
        self.passed = 0     # above the trade's gate and Google-confirmed
        self.sendable = 0   # that, and on a mobile: what can go out today
        self.new = 0
        self.in_crm = 0
        self.excluded = 0
        self.failure_rate = 0.0
        self.blocked = False
        self.stopped = False   # the walk ended on data/.stop, not on an empty queue
        self.cancelled = False  # ended by Stop on the page: do NOT re-queue it

    @classmethod
    def resumed(cls, run_id, rows, prior=None):
        """Pick up a run's tallies instead of starting it again from nothing.

        Everything a run needs to resume is on disk, so a restart re-walks only the
        pending rows. The counters did not know that: they started at 0 and the
        first push wrote those zeroes over what the run had already reported. The
        queue file is authoritative for how many queries are done; the run row is
        the only record of what they found.
        """
        p = cls(run_id, len(rows))
        p.done = sum(1 for r in rows if (r.get("status") if hasattr(r, "get") else None) == "done")
        if prior:
            p.raw = prior.get("raw_found") or 0
            p.kept = prior.get("kept_count") or 0
            p.passed = prior.get("passed_count") or 0
            p.sendable = prior.get("sendable_count") or 0
            p.new = prior.get("new_count") or 0
            p.in_crm = prior.get("in_crm_count") or 0
            p.excluded = prior.get("excluded_count") or 0
        return p

    def as_patch(self, **extra):
        # pass_rate is kept / raw, the SOP's number, and it answers "how much of
        # what Google returned was worth STORING". Since the qualifier fix that is
        # close to honest by accident, but it is still not the number anyone wants:
        # a stored lead is not a lead you can ring. sendable_count is.
        pass_rate = round(self.kept / self.raw, 3) if self.raw else 0.0
        return {
            "total_queries": self.total, "done_queries": self.done,
            "raw_found": self.raw, "kept_count": self.kept, "new_count": self.new,
            "passed_count": self.passed, "sendable_count": self.sendable,
            "in_crm_count": self.in_crm, "excluded_count": self.excluded,
            "pass_rate": pass_rate, "failure_rate": self.failure_rate,
            "blocked": self.blocked, **extra,
        }

    def push(self, **extra):
        if not self.run_id:
            return
        try:
            store.update_run(self.run_id, self.as_patch(**extra))
        except Exception as e:  # progress reporting must never kill a run
            print(f"  (progress push failed: {e})", file=sys.stderr)


def send_rate(prog):
    """sendable / raw. What a run is actually worth, as a fraction of what it saw."""
    return round(prog.sendable / prog.raw, 3) if prog.raw else 0.0


def _note_blocker(message):
    LOGS.mkdir(parents=True, exist_ok=True)
    with open(LOGS / "blocker.txt", "a", encoding="utf-8") as f:
        f.write(f"{store.now_iso()} {message}\n")


def _scrape_with_backoff(queries, out_name, depth, proxies=None):
    """One gosom call, with the SOP's single retry when Google starts throttling."""
    stats = run_maps.run_gmaps(queries, out_name, depth=depth, concurrency=CONCURRENCY,
                               inactivity=INACTIVITY, proxies=proxies)
    if stats["failure_rate"] > BLOCK_THRESHOLD:
        print(f"    failure_rate {stats['failure_rate']} - backing off, one retry")
        time.sleep(30)
        stats = run_maps.run_gmaps(queries, out_name, depth=depth, concurrency=1,
                                   inactivity="5m", proxies=proxies)
    return stats


def execute(rows, active_niche, run_id=None, size="standard", proxies=None,
            queue_path=None, crm_phones=frozenset()):
    """Walk a queue to completion. `rows` is mutated in place and saved after every
    batch, which is what makes the run resumable."""
    cfg = build_queue.RUN_SIZES.get(size) or build_queue.RUN_SIZES["standard"]
    depth = cfg["depth"]
    prior = None
    if run_id:
        try:
            prior = store.get_run(run_id)
        except Exception as e:  # a resume must never fail on bookkeeping
            print(f"  (could not read the run's previous tallies: {e})", file=sys.stderr)
    prog = Progress.resumed(run_id, rows, prior)
    prog.push()

    bad_metros = 0
    maps_paused = False
    fallback_ok, fallback_msg = fallback.available()

    def save():
        if queue_path:
            queue_path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")

    while True:
        why = stopped()
        if why:
            print(f"stopping: {why}")
            prog.stopped = True
            save()
            break
        if cancelled_in_app(run_id):
            print("stopped from the app")
            prog.cancelled = True
            save()
            break
        pending = [r for r in rows if r["status"] == "pending"]
        if not pending:
            break
        head = pending[0]
        batch = [r for r in pending
                 if r["metro"] == head["metro"] and r["pass"] == head["pass"]][:BATCH]

        metro_qualified = 0

        for kw in sorted({r["keyword"] for r in batch}):        # one run per keyword
            # Asked once per keyword, not once per batch. A batch is forty
            # queries across ten keywords and takes the better part of an hour,
            # and a Stop that waits that long is not a stop.
            if cancelled_in_app(run_id):
                print("stopped from the app")
                prog.cancelled = True
                break
            kw_rows = [r for r in batch if r["keyword"] == kw]
            queries = sorted({f'{r["keyword"]} {r["location"]}' for r in kw_rows})

            if maps_paused:
                print(f"  {head['metro']}/{kw}: maps paused, skipping")
                prog.done += len(kw_rows)
                continue

            stats = _scrape_with_backoff(queries, f"b_{kw_rows[0]['id']}.json", depth, proxies)
            recs, qual = pipeline.records_from_json(
                stats["path"], metro=head["metro"], state=head["state"],
                source_keyword=kw, active_niche=active_niche, run_id=run_id,
                crm_phones=crm_phones,
            )
            new = pipeline.upsert(recs)

            prog.done += len(kw_rows)
            prog.raw += qual["raw"]
            prog.kept += qual["kept"]
            prog.passed += qual["passed"]
            prog.sendable += qual["sendable"]
            prog.excluded += qual["excluded"] + qual["dropped_low"]
            prog.in_crm += qual["in_crm"]
            prog.new += len(new)
            prog.failure_rate = stats["failure_rate"]
            metro_qualified += qual["kept"]

            print(f"  {head['metro']}/{kw}: raw={stats['rows']} kept={len(recs)} "
                  f"sendable={qual['sendable']} new={len(new)} fr={stats['failure_rate']}")

            if stats["failure_rate"] > BLOCK_THRESHOLD:
                bad_metros += 1
                if bad_metros >= BAD_METROS_BEFORE_PAUSE and not proxies:
                    maps_paused = True
                    prog.blocked = True
                    msg = (f"Maps paused after {bad_metros} throttled metros with no proxies set. "
                           f"Fix is residential proxies (~$1.50/GB), a spend decision.")
                    _note_blocker(msg)
                    print(f"  ** {msg}")
            else:
                bad_metros = 0

            prog.push()

        if prog.cancelled:
            save()
            break

        # Thin metro: top up from the directories rather than accept a dud market.
        if head["pass"] == 1 and metro_qualified < fallback.MIN_QUALIFIED:
            if fallback_ok:
                kw = active_niche.keywords[0] if active_niche.keywords else "contractor"
                print(f"  {head['metro']}: thin ({metro_qualified} qualified), topping up")
                added, fstats = fallback.top_up(head["metro"], head["state"], kw,
                                                active_niche, run_id, crm_phones)
                prog.new += added
                prog.kept += fstats["kept"]
                prog.raw += fstats["raw"]
                prog.passed += fstats["passed"]
                prog.sendable += fstats["sendable"]
                print(f"  {head['metro']}: directory fallback added {added}")
            else:
                print(f"  {head['metro']}: thin ({metro_qualified}) but {fallback_msg}")

        for r in batch:
            r["status"] = "done"
        save()
        prog.push()

    return prog


def release_to_queue(run_id, why, **counts):
    """Put a claimed run back on the queue rather than abandoning it at 'running'.

    Everything a run needs to resume is on disk (queue_<id>.jsonl keeps every row
    that finished), so 'queued' is both honest and useful: the page stops claiming
    work is in progress, and the next runner picks it up where it stood.
    """
    if not run_id:
        return
    try:
        store.update_run(run_id, {"status": "queued", **counts})
    except Exception as e:   # never let bookkeeping mask the reason we are here
        print(f"  (could not release run {run_id}: {e})", file=sys.stderr)
    else:
        print(f"  run {run_id} returned to the queue ({why})")


def reap_stranded():
    """Put back on the queue any run this machine abandoned at 'running'.

    Everything a run needs to resume is on disk, so this costs the batch that was
    in flight when the runner died and nothing else. Nobody has to notice, and
    the page stops claiming work is in progress that nothing is doing.

    Never raises: a sweep that cannot run is a poll that reclaims nothing, and
    the next one is a minute away.
    """
    try:
        rows = store.stranded_runs(store.hostname(), REAP_STALE_AFTER)
    except Exception as e:
        print(f"  (could not look for stranded runs: {e})", file=sys.stderr)
        return 0
    reclaimed = 0
    for row in rows:
        try:
            if store.requeue_if_running(row["id"]):
                reclaimed += 1
                print(f"run {row['id']} was left at 'running' with nothing working it "
                      f"({row.get('done_queries')}/{row.get('total_queries')} done, "
                      f"last moved {row.get('updated_at')}); back on the queue")
        except Exception as e:
            print(f"  (could not reclaim {row['id']}: {e})", file=sys.stderr)
    return reclaimed


def keep_cancelled(run_id, **counts):
    """Write what a stopped run found, and leave its status alone.

    The opposite of release_to_queue, and the reason both exist. data/.stop
    PAUSES: the run goes back to 'queued' and the next poll resumes it. Stop on
    the page ENDS it, and the row already says so, so re-queueing here would have
    the run start again seconds after Jake stopped it.

    What it found stays: the leads are in the table, the tallies go on the row,
    and data/queue_<id>.jsonl still holds every finished query, so putting the
    row back to 'queued' by hand resumes it where it stood rather than from the
    start.
    """
    if not run_id:
        return
    try:
        store.update_run(run_id, counts)
    except Exception as e:   # never let bookkeeping mask the reason we are here
        print(f"  (could not write the final tallies for {run_id}: {e})", file=sys.stderr)


def run_job(run):
    """Execute one wizard run end to end."""
    run_id = run["id"]

    why = stopped()
    if why:
        print(f"scraper is off ({why}). Delete {STOP_FILE} to scrape again.", file=sys.stderr)
        # The row may already be claimed (--watch stamps 'running' before it gets
        # here, and a restarted runner re-enters with a claimed row). Returning without
        # putting it back left it reading 'running' on the page for ever, with no
        # process anywhere working it. 'queued' is the truth and it resumes.
        release_to_queue(run_id, "scraper is off")
        return

    # --watch claims the row (which stamps these); --run <id> does not, and a run
    # that is being worked while the page still reads "queued" tells Jake to go and
    # start a runner that is already going.
    if run.get("status") != "running":
        store.update_run(run_id, {"status": "running", "started_at": store.now_iso(),
                                  "host": store.hostname()})

    spec = run.get("niche_spec")
    active = niche_mod.niche_from_spec(spec) if spec else niche_mod.load_niche(run.get("niche_id"))

    states = run.get("states") or []
    cities = run.get("cities") or []
    size = run.get("size") or "standard"

    rows = build_queue.build_rows_for_job(states=states, cities=cities, size=size,
                                          keywords=active.keywords)
    if not rows:
        store.finish_run(run_id, "failed", error="No locations resolved for this run.")
        print("no locations resolved; nothing to do")
        return

    queue_path = DATA / f"queue_{run_id}.jsonl"
    if queue_path.exists():                       # resume an interrupted run
        rows_on_disk = [json.loads(l) for l in queue_path.read_text().splitlines() if l.strip()]
        by_id = {r["id"]: r for r in rows_on_disk}
        for r in rows:
            if r["id"] in by_id:
                r["status"] = by_id[r["id"]]["status"]
    build_queue.write_queue(rows, queue_path)

    ok, msg = run_maps.engine_available()
    if not ok:
        store.finish_run(run_id, "failed", error=msg)
        print(msg, file=sys.stderr)
        return
    print(f"engine {msg}")

    crm_phones = store.load_crm_phones()
    print(f"{len(rows)} queries, {len(crm_phones)} phones already in the CRM")

    try:
        prog = execute(rows, active, run_id=run_id, size=size,
                       proxies=run.get("proxies"), queue_path=queue_path,
                       crm_phones=crm_phones)
    except Exception as e:
        store.finish_run(run_id, "failed", error=str(e)[:500])
        raise

    if prog.cancelled:
        keep_cancelled(run_id, **prog.as_patch())
        print(f"stopped from the app. {prog.done}/{prog.total} queries done")
        return

    if prog.stopped:
        release_to_queue(run_id, "stopped mid-run", **prog.as_patch())
        print(f"stopped. {prog.done}/{prog.total} queries done, back on the queue")
        return

    store.finish_run(run_id, "done", **prog.as_patch())
    print(f"done. raw={prog.raw} kept={prog.kept} passed={prog.passed} "
          f"sendable={prog.sendable} new={prog.new} in_crm_skipped={prog.in_crm} "
          f"pass_rate={prog.as_patch()['pass_rate']} send_rate={send_rate(prog)}")
    print(f"table total: {pipeline.table_count()}")


def watch(interval=10, polls=None):
    """Poll for queued runs until stopped. `polls` bounds the loop, for tests.

    This is installed as a service (install-watcher.ps1), so that pressing Go in
    the app is the whole job on Jake's side. That changes what data/.stop has to
    do: it used to RETURN, and a service answers a process that returned by
    starting it again, forever. It idles instead. The switch stops SCRAPING,
    which is what it is for, and stopping is not the same as dying.
    """
    print(f"watching for queued runs every {interval}s (ctrl-c to stop)")
    said = None
    n = 0
    last_reap = 0.0
    while polls is None or n < polls:
        n += 1
        why = stopped()
        if why:
            if why != said:  # once per reason, not once per poll: this runs for weeks
                print(f"scraper is off ({why}). Delete {STOP_FILE} to scrape again.",
                      file=sys.stderr)
                said = why
            time.sleep(interval)
            continue
        if said:
            print("off switch cleared, watching again")
            said = None
        # Swept before the claim, so a run reclaimed here is picked up on this
        # same pass. last_reap starts at zero deliberately: the first sweep is
        # the one that matters, because logon is exactly when the runner that
        # died is being replaced.
        if time.monotonic() - last_reap >= REAP_EVERY:
            last_reap = time.monotonic()
            reap_stranded()
        try:
            run = store.claim_next_run()
        except Exception as e:
            print(f"poll failed: {e}", file=sys.stderr)
            run = None
        if run:
            print(f"\n--- run {run['id']} ({run.get('niche_label') or run.get('niche_id')}) ---")
            try:
                run_job(run)
            except Exception as e:
                print(f"run failed: {e}", file=sys.stderr)
        else:
            time.sleep(interval)


def local():
    """The SOP's standalone mode: data/queue.jsonl over data/metros.json."""
    why = stopped()
    if why:
        sys.exit(f"scraper is off ({why}). Delete {STOP_FILE} to scrape again.")
    path = build_queue.QUEUE
    if not path.exists():
        total, added = build_queue.merge_into_queue(build_queue.build_rows())
        print(f"queue total: {total}  added now: {added}")
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    ok, msg = run_maps.engine_available()
    if not ok:
        sys.exit(msg)
    prog = execute(rows, niche_mod.ACTIVE, queue_path=path)
    print(f"done. table total: {pipeline.table_count()}")
    print(f"raw={prog.raw} kept={prog.kept} passed={prog.passed} "
          f"sendable={prog.sendable} new={prog.new} "
          f"pass_rate={prog.as_patch()['pass_rate']} send_rate={send_rate(prog)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Lead scraper coordinator")
    ap.add_argument("--watch", action="store_true", help="poll for runs queued by the app")
    ap.add_argument("--run", metavar="ID", help="execute one run by id")
    ap.add_argument("--local", action="store_true", help="the SOP's standalone queue mode")
    ap.add_argument("--interval", type=int, default=10)
    args = ap.parse_args()

    if args.run:
        job = store.get_run(args.run)
        if not job:
            sys.exit(f"no run {args.run}")
        run_job(job)
    elif args.local:
        local()
    else:
        watch(args.interval)
