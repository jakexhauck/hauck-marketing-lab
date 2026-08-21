"""Export send_status='pending' rows with icp_score >= EXPORT_THRESHOLD, best score
first, re-validate phone, drop landlines, drop suppressed phones, dedupe, require a
name, write <=1000-row CSVs, and stamp send_status so re-runs pull only fresh
numbers. --dry-run stamps nothing.

Line type is screened here rather than at send. The SOP left it to the SMS platform
because the check used to cost money per lookup; NANPA's free block data (linetype.py)
means we can refuse a landline before it ever reaches a list.

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

import linetype
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


def threshold_for(niche_id=None):
    """The gate is the CHOSEN trade's own threshold, not the ambient default.

    MIN_SCORE comes from niche.ACTIVE, which is whatever LEADS_NICHE happens to say
    (home_services by default). Exporting roofing while ACTIVE was home_services
    silently used the wrong trade's number. A trade that has no file falls back to
    the default rather than refusing to export.
    """
    if not niche_id:
        return MIN_SCORE
    try:
        return niche.load_niche(niche_id).export_threshold
    except (FileNotFoundError, ValueError):
        return MIN_SCORE


def series_for(niche_id=None):
    """One batch series per trade, so a stamp says which trade it came from and two
    trades exporting on the same day cannot share a batch number."""
    return f"{SERIES}_{niche_id}" if niche_id else SERIES


def pool_url(min_score=None, run_id=None, niche_id=None, include_in_crm=False):
    """The PostgREST query the export pool comes from. Separate from the fetching so
    the scoping rules can be tested without a network."""
    cols = "id,phone_e164,business_name,city,state,icp_score"
    url = (f"{REST}?select={cols}&icp_score=gte.{min_score or threshold_for(niche_id)}"
           f"&send_status=eq.pending")
    if not include_in_crm:
        url += "&in_crm=is.false"
    if run_id:
        url += f"&run_id=eq.{urllib.parse.quote(str(run_id), safe='')}"
    if niche_id:
        url += f"&niche_id=eq.{urllib.parse.quote(str(niche_id), safe='')}"
    return url + "&order=icp_score.desc,id.asc"


def fetch_pool(min_score=None, run_id=None, niche_id=None, include_in_crm=False):
    url = pool_url(min_score, run_id, niche_id, include_in_crm)
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
    """Landlines are dropped outright, not merely deprioritised: the whole point of
    this list is a number somebody carries in their pocket. 'unknown' fails the same
    test, which is what we want, because the numbers that land there are toll-free
    and non-US ones that were never mobiles either."""
    suppressed = suppress.load_suppressed()
    seen, out = set(), []
    for row in pool:
        e164 = normalize_phone(row.get("phone_e164") or "")
        if not e164 or e164 in suppressed or e164 in seen:
            continue
        if not linetype.is_mobile(e164):
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


def next_index(out_dir, series=SERIES):
    used = [int(m.group(1)) for f in out_dir.glob(f"{series}_*.csv*")
            if (m := re.fullmatch(rf"{re.escape(series)}_(\d+)\.csv(\.part)?", f.name))]
    return max(used, default=0) + 1


def main(dry_run=False, run_id=None, niche_id=None):
    """Write the batches. `niche_id` scopes the pool to one trade; None means every
    trade at once, which the CLI makes you ask for by name."""
    out_dir = OUT_DIR if not dry_run else OUT_DIR.parent / "sms_export_dryrun"
    out_dir.mkdir(parents=True, exist_ok=True)
    series = series_for(niche_id)
    recs = clean(fetch_pool(run_id=run_id, niche_id=niche_id))
    start = next_index(out_dir, series)
    for bi, i in enumerate(range(0, len(recs), BATCH_SIZE)):
        n = start + bi
        batch = recs[i:i + BATCH_SIZE]
        path = out_dir / f"{series}_{n:03d}.csv"
        part = path.with_suffix(".csv.part")
        write_csv(part, batch)                       # stage as .part
        if not dry_run:
            mark_exported([r["phone"] for r in batch], f"{series}_{n:03d}_queued")
        part.rename(path)                            # promote only after stamping
        print(f"  {path.name}: {len(batch)} rows")
    scope = niche_id or "EVERY trade"
    print(f"exported {len(recs)} numbers ({scope}, gate {threshold_for(niche_id)}) to {out_dir}")


def _usage():
    """A trade has to be named. The table holds every trade this has ever hunted,
    including ones it no longer hunts, and an unscoped export quietly mixes them:
    on 2026-08-20 the pool's best-scoring rows were HVAC, a trade dropped in
    e0ee691e, sitting above windows-and-doors leads in the same CSV."""
    print("usage: export_sms.py --niche <id> [--dry-run] [--run <id>]", file=sys.stderr)
    print("       export_sms.py --all-niches   (mixes every trade into one list)",
          file=sys.stderr)
    print(file=sys.stderr)
    print("trades:", ", ".join(n["id"] for n in niche.available_niches()), file=sys.stderr)
    return 2


if __name__ == "__main__":
    args = sys.argv[1:]

    def _opt(flag):
        return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else None

    chosen = _opt("--niche")
    if not chosen and "--all-niches" not in args:
        sys.exit(_usage())
    sys.exit(main(dry_run="--dry-run" in args, run_id=_opt("--run"), niche_id=chosen) or 0)
