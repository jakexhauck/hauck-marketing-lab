"""Supabase REST access for everything that is NOT the SOP's leads table: the run
queue the wizard writes, its progress, and the GoHighLevel phone snapshot.

Kept out of pipeline.py deliberately. pipeline.py is the SOP's only DB writer for
leads and stays that way; this module never touches cold_sms_outreach_numbers.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import net

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BASE = f"{SUPABASE_URL}/rest/v1"

_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def _request(method, path, body=None, prefer=None, timeout=60):
    headers = dict(_HDRS)
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with net.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}") from e


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hostname():
    """Which machine claimed the run. Jake scrapes from the Mac and the PC, and the
    run list says which one did the work."""
    explicit = os.environ.get("LEADS_HOST")
    if explicit:
        return explicit
    if hasattr(os, "uname"):
        return os.uname().nodename
    return os.environ.get("COMPUTERNAME") or "pc"


# --- the run queue -----------------------------------------------------------

def claim_next_run():
    """Take the oldest queued run and mark it running. Returns the run or None.

    The status filter in the PATCH is the lock: if another machine (the PC) claimed
    it first, the row no longer matches and we get an empty list back.
    """
    queued = _request("GET", "/scrape_runs?status=eq.queued&order=created_at.asc&limit=1")
    if not queued:
        return None
    run = queued[0]
    claimed = _request(
        "PATCH",
        f"/scrape_runs?id=eq.{run['id']}&status=eq.queued",
        {"status": "running", "started_at": now_iso(), "host": hostname()},
        prefer="return=representation",
    )
    return claimed[0] if claimed else None


def stranded_runs(host, stale_after_s):
    """Runs this machine left at 'running' and has not touched since.

    A run pushes its tallies after every keyword, and 0124's trigger stamps
    updated_at on every write, so "has not moved in a quarter of an hour" is the
    difference between a run being worked and a run whose runner died.

    Scoped to this host on purpose. A run being worked on the Mac is the Mac's
    business, and reclaiming it from here would have two machines scraping the
    same queue.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=stale_after_s)).isoformat()
    return _request(
        "GET",
        f"/scrape_runs?status=eq.running"
        f"&host=eq.{urllib.parse.quote(host, safe='')}"
        f"&updated_at=lt.{urllib.parse.quote(cutoff, safe='')}"
        f"&select=id,niche_label,done_queries,total_queries,updated_at",
    )


def requeue_if_running(run_id):
    """Put a run back on the queue, only while it still reads 'running'.

    The status filter travels with the write. Between deciding a run is stranded
    and saying so, its runner may have come back to life, or Jake may have
    pressed Stop: either way the row no longer matches and nothing happens, which
    is the whole point of doing it in one statement.
    """
    rows = _request(
        "PATCH",
        f"/scrape_runs?id=eq.{urllib.parse.quote(str(run_id), safe='')}&status=eq.running",
        {"status": "queued"},
        prefer="return=representation",
    )
    return bool(rows)


def get_run(run_id):
    rows = _request("GET", f"/scrape_runs?id=eq.{urllib.parse.quote(str(run_id), safe='')}")
    return rows[0] if rows else None


def update_run(run_id, patch):
    return _request("PATCH", f"/scrape_runs?id=eq.{urllib.parse.quote(str(run_id), safe='')}",
                    patch, prefer="return=representation")


def count_leads_for_run(run_id):
    """How many distinct businesses this run actually put in the table.

    The SOP's coordinator prints len(upserted), which counts upsert WRITES. One
    contractor is found by several of the 14 keywords, so a Boise run reports 409
    writes for 193 businesses. That is fine in a log line and wrong in a column
    headed "Added", so the run's tally is counted from the table instead.
    """
    headers = {**_HDRS, "Prefer": "count=exact", "Range": "0-0"}
    url = (f"{BASE}/cold_sms_outreach_numbers?select=id"
           f"&run_id=eq.{urllib.parse.quote(str(run_id), safe='')}")
    req = urllib.request.Request(url, headers=headers)
    try:
        with net.urlopen(req, timeout=30) as r:
            return int(r.headers.get("Content-Range", "*/0").split("/")[-1])
    except Exception:
        return None


def finish_run(run_id, status, **counts):
    patch = {"status": status, "finished_at": now_iso(), **counts}
    # Only for a run that got as far as writing rows; a failed run keeps whatever
    # it managed, rather than being told it added zero.
    if status == "done":
        actual = count_leads_for_run(run_id)
        if actual is not None:
            patch["new_count"] = actual
    return update_run(run_id, patch)


# --- the GoHighLevel phone snapshot ------------------------------------------

def load_crm_phones():
    """Every phone already in GoHighLevel, as of the snapshot the app took when the
    run was created. Read once per run and held in memory, which is the whole point:
    no per-lead API call, no rate limit."""
    phones, offset, page = set(), 0, 1000
    while True:
        headers = {**_HDRS, "Range": f"{offset}-{offset + page - 1}"}
        req = urllib.request.Request(f"{BASE}/lead_crm_phone_cache?select=phone_e164", headers=headers)
        try:
            with net.urlopen(req, timeout=60) as r:
                chunk = json.loads(r.read().decode() or "[]")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"crm phone cache -> {e.code}: {e.read().decode()[:200]}") from e
        phones.update(row["phone_e164"] for row in chunk if row.get("phone_e164"))
        if len(chunk) < page:
            return frozenset(phones)
        offset += page
