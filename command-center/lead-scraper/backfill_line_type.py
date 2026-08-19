"""Stamp line_type on leads scraped before the column existed.

New scrapes get it in pipeline.py. This is the one-off for everything already in the
table, and it is safe to re-run: it only writes rows whose stored value differs from
what the block map says, so a second run after a linetype.py --refresh quietly picks
up the blocks that changed hands and leaves the rest alone.

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
from pipeline import REST, SUPABASE_KEY

PAGE = 1000
PATCH_CHUNK = 100

_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def fetch_all():
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(
            f"{REST}?select=phone_e164,line_type&order=id.asc",
            headers={**_HDRS, "Range": f"{offset}-{offset + PAGE - 1}"},
        )
        with net.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode() or "[]")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        offset += PAGE


def patch(phones, value):
    body = json.dumps({"line_type": value}).encode()
    headers = {**_HDRS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(phones), PATCH_CHUNK):
        vals = ",".join(urllib.parse.quote(p, safe="") for p in phones[i:i + PATCH_CHUNK])
        req = urllib.request.Request(f"{REST}?phone_e164=in.({vals})",
                                     data=body, method="PATCH", headers=headers)
        try:
            net.urlopen(req, timeout=60).close()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"patch {e.code}: {e.read().decode()[:300]}") from e


def main(dry_run=False):
    rows = fetch_all()
    pending = collections.defaultdict(list)
    tally = collections.Counter()

    for row in rows:
        phone = row.get("phone_e164") or ""
        want = linetype.line_type_of(phone)
        tally[want] += 1
        if row.get("line_type") != want:
            pending[want].append(phone)

    total = len(rows) or 1
    print(f"{len(rows):,} leads")
    for value in (linetype.WIRELESS, linetype.LANDLINE, linetype.UNKNOWN):
        print(f"  {value:<9} {tally[value]:>7,}  {tally[value] / total:6.1%}")

    to_write = sum(len(v) for v in pending.values())
    if dry_run:
        print(f"\ndry run: {to_write:,} rows would be written")
        return
    for value, phones in pending.items():
        patch(phones, value)
    print(f"\nwrote {to_write:,} rows")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
