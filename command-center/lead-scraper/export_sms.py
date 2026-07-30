"""Export send_status='pending' rows with icp_score >= EXPORT_THRESHOLD, best score
first, re-validate phone, drop suppressed phones, dedupe, require a name, write
<=1000-row CSVs, and stamp send_status so re-runs pull only fresh numbers. Line type
is screened by your SMS platform at send, so no paid API here. --dry-run stamps
nothing.

Verbatim from the SOP. The app's "send to Cold Call / SMS" path stamps the same
send_status column through the same rules, so the CSV button and the in-app send can
never hand out the same number twice.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import net
import niche
import suppress
from pipeline import REST, SUPABASE_KEY, normalize_phone

MIN_SCORE = niche.EXPORT_THRESHOLD
BATCH_SIZE = 1000
SERIES = "cold_sms_v2_batch"  # your own series name; keeps re-runs from colliding
PATCH_CHUNK = 100
PAGE = 1000
OUT_DIR = Path(__file__).resolve().parent / "out" / "sms_export"

_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def fetch_pool(min_score=None, run_id=None, niche_id=None, include_in_crm=False):
    cols = "id,phone_e164,business_name,city,state,icp_score"
    url = (f"{REST}?select={cols}&icp_score=gte.{min_score or MIN_SCORE}"
           f"&send_status=eq.pending")
    if not include_in_crm:
        url += "&in_crm=is.false"
    if run_id:
        url += f"&run_id=eq.{urllib.parse.quote(str(run_id), safe='')}"
    if niche_id:
        url += f"&niche_id=eq.{urllib.parse.quote(str(niche_id), safe='')}"
    url += "&order=icp_score.desc,id.asc"

    rows, offset = [], 0
    while True:
        req = urllib.request.Request(url, headers={**_HDRS, "Range": f"{offset}-{offset+PAGE-1}"})
        with net.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode() or "[]")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        offset += PAGE


def clean(pool):
    suppressed = suppress.load_suppressed()
    seen, out = set(), []
    for row in pool:
        e164 = normalize_phone(row.get("phone_e164") or "")
        if not e164 or e164 in suppressed or e164 in seen:
            continue
        company = (row.get("business_name") or "").strip()
        if not company:
            continue
        seen.add(e164)
        out.append({"phone": e164, "company": company,
                    "city": (row.get("city") or "").strip(),
                    "state": (row.get("state") or "").strip()})
    return out


def write_csv(path, recs):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Phone", "Company Name", "City", "State"])
        for r in recs:
            w.writerow([r["phone"], r["company"], r["city"], r["state"]])


def mark_exported(phones, label):
    body = json.dumps({"send_status": label}).encode()
    headers = {**_HDRS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(phones), PATCH_CHUNK):
        vals = ",".join(urllib.parse.quote(p, safe="") for p in phones[i:i + PATCH_CHUNK])
        req = urllib.request.Request(f"{REST}?phone_e164=in.({vals})",
                                     data=body, method="PATCH", headers=headers)
        try:
            net.urlopen(req, timeout=60).close()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"mark {e.code}: {e.read().decode()[:300]}") from e


def next_index(out_dir):
    used = [int(m.group(1)) for f in out_dir.glob(f"{SERIES}_*.csv*")
            if (m := re.fullmatch(rf"{SERIES}_(\d+)\.csv(\.part)?", f.name))]
    return max(used, default=0) + 1


def main(dry_run=False, run_id=None):
    out_dir = OUT_DIR if not dry_run else OUT_DIR.parent / "sms_export_dryrun"
    out_dir.mkdir(parents=True, exist_ok=True)
    recs = clean(fetch_pool(run_id=run_id))
    start = next_index(out_dir)
    for bi, i in enumerate(range(0, len(recs), BATCH_SIZE)):
        n = start + bi
        batch = recs[i:i + BATCH_SIZE]
        path = out_dir / f"{SERIES}_{n:03d}.csv"
        part = path.with_suffix(".csv.part")
        write_csv(part, batch)                       # stage as .part
        if not dry_run:
            mark_exported([r["phone"] for r in batch], f"{SERIES}_{n:03d}_queued")
        part.rename(path)                            # promote only after stamping
        print(f"  {path.name}: {len(batch)} rows")
    print(f"exported {len(recs)} numbers to {out_dir}")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
