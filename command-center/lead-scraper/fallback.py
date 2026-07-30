"""Thin-metro fallback (SOP step 7, item 2).

If a metro's first pass yields under MIN_QUALIFIED, queue a Houzz/Manta scrape for
that city via Scrapling's StealthyFetcher, harvest tel: links plus the nearby
business names, and run them through the same classify. These are upserted
insert-only so they can never overwrite an enriched Maps row.

Scrapling is an optional install. If it is missing, the fallback reports itself as
unavailable and the coordinator carries on with Maps only, rather than dying.
"""

from __future__ import annotations

import re
import urllib.parse
from datetime import datetime, timezone

import niche
import pipeline

MIN_QUALIFIED = 15          # below this, a metro is "thin" and gets topped up
MAX_PER_SOURCE = 60

TEL_RE = re.compile(r"tel:([+0-9()\-.\s]{7,})")


def available():
    """Whether the directory fallback can actually fetch anything.

    Checks the fetcher, not the package. `import scrapling` succeeds on a partial
    install whose browser engine is missing its own dependencies, which would make
    this report ready and then quietly return nothing from every thin metro. A
    fallback that lies about being available is worse than one that is absent.
    """
    try:
        from scrapling.fetchers import StealthyFetcher  # noqa: F401
    except ImportError as e:
        return False, (
            f"directory fallback unavailable ({e}). Maps only. To enable it:\n"
            "  .venv/bin/pip install 'scrapling[fetchers]' && "
            ".venv/bin/python -m scrapling install"
        )
    return True, "scrapling ready"


def _fetch(url):
    from scrapling.fetchers import StealthyFetcher

    return StealthyFetcher.fetch(url, headless=True, network_idle=True)


def _harvest(page, source):
    """Pull (name, phone) pairs off a directory page.

    Directory markup shifts constantly, so this stays deliberately dumb: find the
    tel: links, then take the nearest readable text above each one as the name.
    Anything without both a name and a phone is discarded rather than guessed at.
    """
    out = []
    try:
        html = page.html_content if hasattr(page, "html_content") else str(page)
    except Exception:
        return out

    for match in TEL_RE.finditer(html):
        raw_phone = match.group(1).strip()
        window = html[max(0, match.start() - 1200):match.start()]
        names = re.findall(r'>([A-Z][^<>{}]{3,60})<', window)
        name = ""
        for candidate in reversed(names):
            candidate = candidate.strip()
            if candidate and not candidate.lower().startswith(("http", "call", "phone", "tel")):
                name = candidate
                break
        if name and raw_phone:
            out.append({"title": name, "phone": raw_phone, "source": source})
        if len(out) >= MAX_PER_SOURCE:
            break
    return out


def scrape_city(city, state, keyword):
    """Houzz then Manta for one thin city. Returns raw gosom-shaped dicts."""
    ok, _ = available()
    if not ok:
        return []

    q = urllib.parse.quote_plus(f"{keyword} {city} {state}".strip())
    targets = [
        (f"https://www.houzz.com/professionals/query/{q}", "houzz"),
        (f"https://www.manta.com/search?search={q}", "manta"),
    ]

    rows = []
    for url, source in targets:
        try:
            rows.extend(_harvest(_fetch(url), source))
        except Exception:
            continue  # a directory being unreachable is not a run-ending event
    return rows


def records_from_rows(rows, metro, state, source_keyword, active_niche=None, run_id=None,
                      crm_phones=frozenset()):
    """Same qualifier, same normalising, same shape as the Maps path."""
    n = active_niche or niche.ACTIVE
    now = datetime.now(timezone.utc).isoformat()
    out = {}
    stats = {"raw": 0, "no_phone": 0, "excluded": 0, "dropped_low": 0, "kept": 0, "in_crm": 0}

    for row in rows:
        stats["raw"] += 1
        e164 = pipeline.normalize_phone(str(row.get("phone") or "").strip())
        if not e164:
            stats["no_phone"] += 1
            continue
        name = str(row.get("title") or "").strip()

        score, flags, verdict = niche.classify(
            name, "", (), review_count=None, rating=None, website=None,
            phone_type=niche.phone_type_of(e164), niche=n,
        )
        if verdict == "drop":
            stats["excluded" if flags and flags[0].startswith("exclude") else "dropped_low"] += 1
            continue
        stats["kept"] += 1

        already = e164 in crm_phones
        if already:
            stats["in_crm"] += 1

        out.setdefault(e164, {
            "business_name": name or None, "phone_e164": e164,
            "phone_raw": str(row.get("phone") or "").strip() or None,
            "niche_confidence": "high" if score >= n.export_threshold else "med",
            "icp_score": score, "icp_flags": flags, "scored_at": now,
            "city": metro or None, "state": (state or "").upper()[:2] or None,
            "metro": metro or None, "source": row.get("source") or "directory",
            "source_keyword": source_keyword, "updated_at": now,
            "niche_id": n.id, "run_id": run_id, "in_crm": already,
        })
    return list(out.values()), stats


def top_up(city, state, keyword, active_niche=None, run_id=None, crm_phones=frozenset()):
    """Scrape, qualify and INSERT-ONLY upsert, so an enriched Maps row is never
    overwritten by a thinner directory row."""
    rows = scrape_city(city, state, keyword)
    recs, stats = records_from_rows(rows, city, state, keyword, active_niche, run_id, crm_phones)
    new = pipeline.upsert(recs, merge=False) if recs else []
    return len(new), stats
