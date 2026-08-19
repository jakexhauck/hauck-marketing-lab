"""Push the NANPA block map into the database.

linetype.py keeps the map as a file so the scraper can answer offline. The database
needs its own copy, because the call book is written by paths that never run this
Python at all (the GoHighLevel sync, the CSV import, the "Add lead" button), and a
trigger over there is the only thing that catches every one of them. Same map, two
readers.

Run it after linetype.py --refresh, and after migration 0115 has created the table:

    .venv/bin/python linetype.py --refresh
    .venv/bin/python load_npanxx.py

Only 'unknown' is absent from the table on purpose: a block the file does not list
gets no row, and line_type_for_phone answers 'unknown' by finding nothing.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

import linetype
import net

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REST = f"{SUPABASE_URL}/rest/v1/npanxx_line_type"
CHUNK = 5000

_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def existing_count() -> int:
    req = urllib.request.Request(f"{REST}?select=npanxx",
                                 headers={**_HDRS, "Prefer": "count=exact", "Range": "0-0"})
    with net.urlopen(req, timeout=60) as r:
        return int(r.headers.get("Content-Range", "*/0").split("/")[-1])


def upload(rows: list[dict]) -> None:
    headers = {**_HDRS, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), CHUNK):
        body = json.dumps(rows[i:i + CHUNK]).encode()
        req = urllib.request.Request(f"{REST}?on_conflict=npanxx",
                                     data=body, method="POST", headers=headers)
        try:
            net.urlopen(req, timeout=180).close()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"load {e.code}: {e.read().decode()[:300]}") from e
        done = min(i + CHUNK, len(rows))
        print(f"  {done:,} / {len(rows):,}", end="\r", flush=True)
    print(" " * 40, end="\r")


def main(dry_run: bool = False) -> None:
    block_map = linetype.load()
    if not block_map:
        raise SystemExit("no local map; run: python linetype.py --refresh")

    rows = [{"npanxx": code, "line_type": value} for code, value in sorted(block_map.items())]
    wireless = sum(1 for r in rows if r["line_type"] == linetype.WIRELESS)
    print(f"local map: {len(rows):,} blocks  ({wireless:,} wireless, {len(rows) - wireless:,} landline)")
    print(f"in database before: {existing_count():,}")

    if dry_run:
        print("dry run: nothing written")
        return

    upload(rows)
    print(f"in database after:  {existing_count():,}")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
