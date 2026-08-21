"""Re-score every stored lead through the CURRENT rubric.

A word-list edit or a scoring fix only ever changed what the NEXT scrape kept. The
rows already in the table kept the verdict they were given on the day they were
found, so tightening the qualifier left the old mistakes sitting in the export pool
behind a score that no longer means anything. This walks the table and brings every
row up to date.

Two rules, both from the SOP's step 7:

  * A row that now fails is DISQUALIFIED, never deleted. It is stamped through
    send_status, which is what both send paths and the Leads page read, so it
    leaves the screen as well as the export pool. The ROW stays: a later scrape
    still enriches it in place, and write_undo() records every value first.
  * Only a 'pending' row is ever stamped. A row that has been queued or sent already
    means something to a campaign, and re-grading is not allowed to rewrite history.

    python regrade.py --dry-run              every trade, report only
    python regrade.py --niche windows_doors  one trade, write
    python regrade.py                        every trade, write
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import net
import niche
from pipeline import REST, SUPABASE_KEY

PAGE = 1000
PATCH_CHUNK = 100
UNDO_PATH = pathlib.Path(__file__).resolve().parent / "data" / "regrade_undo.json"
_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

# The stamp a disqualified row carries. Dated, so a later look can tell which pass
# of the rubric rejected it, and prefixed so every one of them is one query away.
DISQUALIFIED = "disqualified"


def disqualified_label(day=None):
    day = day or datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{DISQUALIFIED}_{day}"


def fetch_all(niche_id=None):
    cols = ("id,phone_e164,business_name,primary_type,categories,review_count,"
            "rating,website,icp_score,send_status,niche_id")
    url = f"{REST}?select={cols}&order=id.asc"
    if niche_id:
        url += f"&niche_id=eq.{urllib.parse.quote(str(niche_id), safe='')}"
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(url, headers={**_HDRS, "Range": f"{offset}-{offset+PAGE-1}"})
        with net.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode() or "[]")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        offset += PAGE


def regrade_row(row, active):
    """(score, flags, verdict) for a stored row, from the columns the scrape saved."""
    cats = row.get("categories")
    cats = [str(c) for c in cats] if isinstance(cats, list) else []
    primary = str(row.get("primary_type") or "") or (cats[0] if cats else "")
    reviews = row.get("review_count")
    return niche.classify(
        row.get("business_name") or "",
        primary,
        cats,
        review_count=int(reviews) if reviews else None,
        rating=row.get("rating"),
        website=row.get("website"),
        phone_type=niche.phone_type_of(row.get("phone_e164") or ""),
        niche=active,
    )


def patch(ids, body):
    """PATCH a set of ids in chunks. Ids are uuids, so `in.(...)` is safe to build."""
    payload = json.dumps(body).encode()
    headers = {**_HDRS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(ids), PATCH_CHUNK):
        vals = ",".join(urllib.parse.quote(str(x), safe="") for x in ids[i:i + PATCH_CHUNK])
        req = urllib.request.Request(f"{REST}?id=in.({vals})", data=payload,
                                     method="PATCH", headers=headers)
        try:
            net.urlopen(req, timeout=60).close()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"regrade patch {e.code}: {e.read().decode()[:300]}") from e


def plan(rows):
    """Work out what each row becomes. Returns (rescored, disqualified, untouched).

    A row whose trade no longer has a niche file cannot be re-scored against
    anything, so it is left exactly as it is and reported: deciding what to do with
    a retired trade's leads is a call for a human, not a default.
    """
    rescored, disqualified, untouched = [], [], []
    cache: dict[str, object] = {}
    for row in rows:
        nid = row.get("niche_id")
        if nid not in cache:
            try:
                cache[nid] = niche.load_niche(nid) if nid else None
            except (FileNotFoundError, ValueError):
                cache[nid] = None
        active = cache[nid]
        if active is None:
            untouched.append(row)
            continue
        score, flags, verdict = regrade_row(row, active)
        if verdict == "drop" and row.get("send_status") == "pending":
            disqualified.append((row, score, flags))
        elif verdict != "drop":
            rescored.append((row, score, flags, verdict, active))
        else:
            untouched.append(row)   # already queued or sent: history is not rewritten
    return rescored, disqualified, untouched


def write_undo(rescored, disqualified, path=None):
    """Every value this is about to overwrite, before it overwrites it.

    A regrade rewrites scores and send_status across the whole table in one go. The
    file is the way back: it holds the OLD value of every field touched, keyed by id,
    so a bad rubric costs one PATCH to undo rather than a re-scrape.
    """
    path = path or UNDO_PATH
    undo = {"note": "UNDO: PATCH each id back to the fields below",
            "written_at": datetime.now(timezone.utc).isoformat(), "rows": {}}
    for row, score, flags, verdict, active in rescored:
        if score == row.get("icp_score"):
            continue
        undo["rows"][row["id"]] = {"business_name": row.get("business_name"),
                                   "icp_score": row.get("icp_score"),
                                   "niche_confidence": row.get("niche_confidence")}
    for row, score, flags in disqualified:
        undo["rows"][row["id"]] = {"business_name": row.get("business_name"),
                                   "send_status": row.get("send_status"),
                                   "icp_score": row.get("icp_score")}
    undo["count"] = len(undo["rows"])
    path.write_text(json.dumps(undo, indent=2), encoding="utf-8")
    return path


def apply(rescored, disqualified, label=None):
    now = datetime.now(timezone.utc).isoformat()
    changed = 0
    # Group the re-scores by their new values so each PATCH carries one body.
    by_value: dict[tuple, list] = {}
    for row, score, flags, verdict, active in rescored:
        if score == row.get("icp_score"):
            continue
        conf = "high" if score >= active.export_threshold else "med"
        by_value.setdefault((score, json.dumps(flags), conf), []).append(row["id"])
    for (score, flags_json, conf), ids in by_value.items():
        patch(ids, {"icp_score": score, "icp_flags": json.loads(flags_json),
                    "niche_confidence": conf, "scored_at": now})
        changed += len(ids)
    if disqualified:
        patch([r["id"] for r, _, _ in disqualified],
              {"send_status": label or disqualified_label(), "scored_at": now})
    return changed


def main(argv):
    dry = "--dry-run" in argv
    nid = argv[argv.index("--niche") + 1] if "--niche" in argv else None
    rows = fetch_all(nid)
    rescored, disqualified, untouched = plan(rows)
    moved = sum(1 for r, s, f, v, a in rescored if s != r.get("icp_score"))
    print(f"rows={len(rows)}  rescored={moved}  disqualified={len(disqualified)}  "
          f"left alone={len(untouched)}")
    for row, score, flags in disqualified[:20]:
        print(f"  DQ {row.get('icp_score')}->{score}  {(row.get('business_name') or '')[:38]:38}"
              f" | {(row.get('primary_type') or '')[:28]:28} | {','.join(flags)[:30]}")
    if len(disqualified) > 20:
        print(f"  ... and {len(disqualified) - 20} more")
    if dry:
        print("dry run: nothing written")
        return 0
    undo = write_undo(rescored, disqualified)
    print(f"undo written to {undo}")
    changed = apply(rescored, disqualified)
    print(f"written: {changed} rescored, {len(disqualified)} disqualified")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
