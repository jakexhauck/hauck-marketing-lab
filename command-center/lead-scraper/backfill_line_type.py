"""Stamp line_type on rows that predate the column, in both books.

Two tables carry the answer. cold_sms_outreach_numbers is the scrape, keyed on
phone_e164; leads is the call book, keyed on phone. New rows in either get stamped
by their trigger (0115), so this is for what was already there.

Safe to re-run, and worth re-running after linetype.py --refresh + load_npanxx.py:
it writes only rows whose stored value disagrees with the block map, so it quietly
picks up the blocks that changed hands and leaves everything else alone.

  .venv/bin/python backfill_line_type.py --dry-run    show the split, write nothing
  .venv/bin/python backfill_line_type.py              write it
"""

from __future__ import annotations

import collections
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

import linetype
import net
from pipeline import REST, SUPABASE_KEY, SUPABASE_URL

PAGE = 1000
PATCH_CHUNK = 100

# (label, endpoint, the column holding the number)
TABLES = [
    ("scraped leads", REST, "phone_e164"),
    ("call book", f"{SUPABASE_URL}/rest/v1/leads", "phone"),
]

_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def fetch_all(endpoint, phone_col):
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(
            f"{endpoint}?select={phone_col},line_type&order=id.asc",
            headers={**_HDRS, "Range": f"{offset}-{offset + PAGE - 1}"},
        )
        with net.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode() or "[]")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        offset += PAGE


def patch(endpoint, phone_col, phones, value):
    body = json.dumps({"line_type": value}).encode()
    headers = {**_HDRS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(phones), PATCH_CHUNK):
        vals = ",".join(urllib.parse.quote(p, safe="") for p in phones[i:i + PATCH_CHUNK])
        req = urllib.request.Request(f"{endpoint}?{phone_col}=in.({vals})",
                                     data=body, method="PATCH", headers=headers)
        try:
            net.urlopen(req, timeout=60).close()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"patch {e.code}: {e.read().decode()[:300]}") from e


def run_table(label, endpoint, phone_col, dry_run):
    rows = fetch_all(endpoint, phone_col)
    pending = collections.defaultdict(list)
    tally = collections.Counter()

    for row in rows:
        phone = row.get(phone_col) or ""
        want = linetype.line_type_of(phone)
        tally[want] += 1
        if row.get("line_type") != want:
            pending[want].append(phone)

    total = len(rows) or 1
    print(f"\n{label}: {len(rows):,} rows")
    for value in (linetype.WIRELESS, linetype.LANDLINE, linetype.UNKNOWN):
        print(f"  {value:<9} {tally[value]:>7,}  {tally[value] / total:6.1%}")

    to_write = sum(len(v) for v in pending.values())
    if dry_run:
        print(f"  dry run: {to_write:,} rows would be written")
        return
    for value, phones in pending.items():
        patch(endpoint, phone_col, phones, value)
    print(f"  wrote {to_write:,} rows")


def main(dry_run=False):
    for label, endpoint, phone_col in TABLES:
        run_table(label, endpoint, phone_col, dry_run)


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
