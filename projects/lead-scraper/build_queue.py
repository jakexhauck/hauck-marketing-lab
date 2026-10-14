"""Build the resumable query queue (keyword x location). Idempotent merge:
re-running keeps 'done' rows and only adds new pending ones.

The SOP's build_queue.py. Two changes, neither to the merge: the keywords come from
the active niche definition rather than a hardcoded list, and rows can be built from
a job handed over by the app (a set of states, or a hand-picked set of cities) as
well as from data/metros.json.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import niche

WD = Path(__file__).resolve().parent
DATA = WD / "data"
METROS = DATA / "metros.json"
QUEUE = DATA / "queue.jsonl"

# Run sizes. The SOP always ran both passes over the full grid; the wizard lets Jake
# trade coverage for wall-clock, so a size caps the locations and the scrape depth.
RUN_SIZES = {
    "quick":    {"passes": (1,),    "max_locations": 1,   "depth": 5,  "label": "Quick"},
    "standard": {"passes": (1, 2),  "max_locations": 40,  "depth": 10, "label": "Standard"},
    "deep":     {"passes": (1, 2),  "max_locations": 400, "depth": 20, "label": "Deep"},
}


def _qid(source, keyword, location):
    return hashlib.sha1(f"{source}|{keyword}|{location}".encode()).hexdigest()[:16]


def _row(source, kw, loc, metro, state, rank, tier, pass_):
    return {"id": _qid(source, kw, loc), "source": source, "keyword": kw,
            "location": loc, "metro": metro, "state": state, "rank": rank,
            "tier": tier, "pass": pass_, "status": "pending", "qualified": 0, "new": 0}


def load_metros():
    """metros.json: list of {metro, state, query_anchor, rank, tier, suburbs[]}."""
    return json.loads(METROS.read_text(encoding="utf-8"))


def build_rows(keywords=None, metros=None):
    """The SOP's full-grid build: every keyword against every metro anchor (pass 1),
    then against each metro's suburb ring (pass 2)."""
    kws = tuple(keywords or niche.ACTIVE.keywords)
    rows = []
    for m in metros if metros is not None else load_metros():
        anchor, metro, state = m["query_anchor"], m["metro"], m["state"]
        rank, tier = m.get("rank", 99), m.get("tier", 2)
        for kw in kws:                              # pass 1: metro anchors
            rows.append(_row("gmaps", kw, anchor, metro, state, rank, tier, 1))
        for sub in m.get("suburbs", []):            # pass 2: suburb rings
            for kw in kws:
                rows.append(_row("gmaps", kw, sub, metro, state, rank, tier, 2))
    return rows


def build_rows_for_job(states=(), cities=(), size="standard", keywords=None):
    """Rows for one wizard run.

    states  - two-letter codes. Their metros and affluent suburbs are pulled from
              metros.json, which is the 'let the app pick the wealthy suburbs' path.
    cities  - explicit {"city": "Plano", "state": "TX"} entries, the hand-pick path.
              These are always pass 1: Jake named them, so nothing is inferred.
    """
    cfg = RUN_SIZES.get(size) or RUN_SIZES["standard"]
    kws = tuple(keywords or niche.ACTIVE.keywords)
    wanted_states = {s.upper() for s in states or ()}

    rows: list[dict] = []

    if wanted_states:
        metros = [m for m in load_metros() if m["state"].upper() in wanted_states]
        metros.sort(key=lambda m: (m.get("rank", 99), m["metro"]))
        rows += [r for r in build_rows(kws, metros) if r["pass"] in cfg["passes"]]

    for entry in cities or ():
        city = (entry.get("city") or "").strip() if isinstance(entry, dict) else str(entry).strip()
        state = (entry.get("state") or "").strip().upper() if isinstance(entry, dict) else ""
        if not city:
            continue
        anchor = f"{city} {state}".strip()
        for kw in kws:
            rows.append(_row("gmaps", kw, anchor, city, state, 0, 1, 1))

    # Cap by distinct location, not by row, so a cap never truncates a location's
    # keyword set half way through and leaves a city half-scraped.
    ordered = sorted(rows, key=lambda r: (r["pass"], r["rank"], r["metro"], r["location"], r["keyword"]))
    kept, seen = [], []
    for r in ordered:
        if r["location"] not in seen:
            if len(seen) >= cfg["max_locations"]:
                continue
            seen.append(r["location"])
        kept.append(r)
    return kept


def merge_into_queue(rows, path=None):
    path = path or QUEUE
    existing = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                existing[r["id"]] = r
    added = 0
    for r in rows:
        if r["id"] not in existing:
            existing[r["id"]] = r
            added += 1
    ordered = sorted(existing.values(),
                     key=lambda r: (r["pass"], r["rank"], r["metro"], r["keyword"], r["location"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in ordered) + "\n")
    return len(ordered), added


def write_queue(rows, path):
    """A fresh, job-scoped queue file. Still resumable: the coordinator flips rows
    to 'done' in place and saves after every batch."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    return len(rows)


if __name__ == "__main__":
    total, added = merge_into_queue(build_rows())
    print(f"queue total: {total}  added now: {added}")
