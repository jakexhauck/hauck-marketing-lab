"""A phone in data/suppression.txt is already committed to an outreach channel
and must NEVER export again, regardless of send_status / score / requalification.
No env/DB dependency so the exporter and tests can enforce it offline. One E.164
per line; '#' comments ignored.

Verbatim from the SOP.
"""

from __future__ import annotations

from pathlib import Path

SUPPRESSION_FILE = Path(__file__).resolve().parent / "data" / "suppression.txt"


def load_suppressed(path=None):
    p = path or SUPPRESSION_FILE
    if not p.exists():
        return frozenset()
    return frozenset(l.strip() for l in p.read_text().splitlines()
                     if l.strip() and not l.startswith("#"))


def merge_suppressed(phones, path=None):
    p = path or SUPPRESSION_FILE
    existing = set(load_suppressed(p))
    before = len(existing)
    merged = existing | {ph.strip() for ph in phones if ph and ph.strip()}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(sorted(merged)) + "\n")
    return len(merged) - before, len(merged)
