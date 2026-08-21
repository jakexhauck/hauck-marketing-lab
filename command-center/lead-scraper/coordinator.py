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
    stats = run_maps.run_gmaps(queries, out_name, depth=depth, concurrency=4, proxies=proxies)
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
        pending = [r for r in rows if r["status"] == "pending"]
        if not pending:
            break
        head = pending[0]
        batch = [r for r in pending
                 if r["metro"] == head["metro"] and r["pass"] == head["pass"]][:BATCH]

        metro_qualified = 0

        for kw in sorted({r["keyword"] for r in batch}):        # one run per keyword
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
