"""Google Maps via gosom (github.com/gosom/google-maps-scraper), native binary.

Each city x keyword runs once, at depth. Queries go in batches; a batch is marked
done only after its listings are stored, so a crash or a Ctrl+C loses at most the
batch in flight and the next run picks up where this one stopped.
"""

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA
from .ingest import ingest

EXE = ".exe" if sys.platform == "win32" else ""
GOSOM = Path(os.environ.get("GOSOM_BIN") or Path.home() / "go" / "bin" / f"google-maps-scraper{EXE}")


class ScrapeStopped(Exception):
    pass


def query_id(query):
    return hashlib.sha1(query.lower().encode()).hexdigest()[:16]


def plan_queries(con, trade, cities, states=None):
    """Queue every city x keyword not already queued. Returns how many were added."""
    added = 0
    with con:
        for c in cities:
            if states and c["state"] not in states:
                continue
            for kw in trade["keywords"]:
                q = f"{kw} in {c['city']}, {c['state']}"
                cur = con.execute("insert or ignore into queries (id, query, city, state) values (?,?,?,?)",
                                  (query_id(q), q, c["city"], c["state"]))
                added += cur.rowcount
    return added


def _read_results(path):
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return []
    if text.startswith("["):
        return json.loads(text)
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def run_batch(queries, depth, tag):
    """queries: (id, text) pairs. The id rides along as gosom's custom input id
    ('text #!#id') and comes back on every listing as input_id."""
    if not GOSOM.is_file():
        raise ScrapeStopped(f"gosom not found at {GOSOM}. Install: go install github.com/gosom/google-maps-scraper@latest")
    work = DATA / "gosom"
    work.mkdir(parents=True, exist_ok=True)
    qfile, rfile = work / f"{tag}.queries.txt", work / f"{tag}.json"
    qfile.write_text("".join(f"{text} #!#{qid}\n" for qid, text in queries), encoding="utf-8")
    rfile.unlink(missing_ok=True)
    cmd = [str(GOSOM), "-input", str(qfile), "-results", str(rfile), "-json",
           "-depth", str(depth), "-c", "4", "-exit-on-inactivity", "3m", "-lang", "en"]
    try:
        subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       timeout=300 + len(queries) * 120)
    except subprocess.TimeoutExpired:
        pass  # whatever it wrote before the timeout is still good
    return _read_results(rfile)


def scrape(con, trade, batch_size=12, max_queries=None, log=print):
    todo = con.execute("select id, query from queries where status='pending' order by rowid").fetchall()
    if max_queries:
        todo = todo[:max_queries]
    totals = {"queries": 0, "listings": 0, "new": 0, "kept": 0}
    empty_batches = 0
    for i in range(0, len(todo), batch_size):
        batch = todo[i:i + batch_size]
        rows = run_batch([(q["id"], q["query"]) for q in batch], trade["depth"], f"batch_{batch[0]['id']}")
        if not rows:
            empty_batches += 1
            log(f"  batch of {len(batch)} returned nothing ({empty_batches} in a row)")
            if empty_batches >= 2:
                raise ScrapeStopped("Two batches in a row came back empty: Google is most likely "
                                    "blocking. Wait an hour and run scrape again; it resumes.")
            continue
        empty_batches = 0
        stats = ingest(con, rows, trade)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with con:
            con.executemany("update queries set status='done', done_at=?, rows=? where id=?",
                            [(now, len(rows), q["id"]) for q in batch])
        for k in totals:
            totals[k] += len(batch) if k == "queries" else stats.get(k, 0)
        log(f"  {totals['queries']}/{len(todo)} searches, {totals['listings']} listings, "
            f"{totals['new']} new numbers, {totals['kept']} kept")
    return totals
