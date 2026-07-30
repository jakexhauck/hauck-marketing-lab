"""Parse gosom -json -> normalize phone -> classify+score -> merge-upsert. Only
module that writes to the DB. Merge enriches an existing row with the fresh scrape
+ fresh score; None values are stripped so a merge never overwrites data with NULL;
send_status is never in the payload (a merge can't clobber send-batch state).

Straight from the SOP. Two additions, both columns rather than logic:
  run_id  - the most recent run that surfaced this lead. Run history counts come
            from scrape_runs' own tallies, not from counting rows, so attributing
            a re-discovered lead to the newer run costs the history nothing.
  in_crm  - true when the phone was already in GoHighLevel at the start of the run.
            The row is still stored and still enriched, exactly as the SOP does;
            the Leads page simply never renders it.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

import phonenumbers

import net

import niche

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TABLE = "cold_sms_outreach_numbers"
REST = f"{SUPABASE_URL}/rest/v1/{TABLE}"


def normalize_phone(raw, region="US"):
    if not raw:
        return None
    try:
        num = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(num):
        return None
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)


def _state_from_address(addr):
    m = re.search(r",\s*([A-Z]{2})\s+\d{5}", addr or "")
    return m.group(1) if m else ""


def _city_from_address(addr):
    m = re.search(r",\s*([^,]+),\s*[A-Z]{2}\s+\d{5}", addr or "")
    return m.group(1).strip() if m else ""


def _num(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def load_records(path):
    """gosom -json is a JSON array or NDJSON; tolerate both."""
    text = open(path, encoding="utf-8", errors="replace").read().strip()
    if not text:
        return []
    if text.startswith("["):
        return json.loads(text)
    out = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def records_from_json(
    path,
    metro,
    state,
    source="gmaps",
    source_keyword=None,
    active_niche=None,
    run_id=None,
    crm_phones=frozenset(),
):
    out, now = {}, datetime.now(timezone.utc).isoformat()
    stats = {"raw": 0, "no_phone": 0, "excluded": 0, "dropped_low": 0, "kept": 0, "in_crm": 0}
    n = active_niche or niche.ACTIVE

    for row in load_records(path):
        stats["raw"] += 1
        e164 = normalize_phone(str(row.get("phone") or "").strip())
        if not e164:
            stats["no_phone"] += 1
            continue

        name = str(row.get("title") or "").strip()
        cats = [str(c).strip() for c in (row.get("categories") or []) if str(c).strip()]
        category = str(row.get("category") or "").strip() or (cats[0] if cats else "")
        review_count = _num(row.get("review_count"))
        review_count = int(review_count) if review_count else None  # gosom emits 0 for none
        rating = _num(row.get("review_rating")) or None
        website = str(row.get("web_site") or row.get("website") or "").strip()

        score, flags, verdict = niche.classify(
            name, category, cats,
            review_count=review_count, rating=rating,
            website=website, phone_type=niche.phone_type_of(e164),
            niche=n,
        )
        if verdict == "drop":
            stats["excluded" if flags and flags[0].startswith("exclude") else "dropped_low"] += 1
            continue
        stats["kept"] += 1

        already = e164 in crm_phones
        if already:
            stats["in_crm"] += 1

        a1 = str(row.get("address") or "").strip()
        comp = row.get("complete_address") if isinstance(row.get("complete_address"), dict) else {}
        clean = a1 if a1 and not a1.startswith("{") else ""
        rec_state = _state_from_address(clean) or (comp.get("state") or "")[:2] or state or ""
        city = str(comp.get("city") or "").strip() or _city_from_address(clean)

        out.setdefault(e164, {
            "business_name": name or None, "phone_e164": e164,
            "phone_raw": str(row.get("phone") or "").strip() or None,
            "niche_confidence": "high" if score >= n.export_threshold else "med",
            "icp_score": score, "icp_flags": flags, "scored_at": now,
            "categories": cats or None, "rating": rating, "review_count": review_count,
            "website": website or None, "address": clean or None, "city": city or None,
            "state": (rec_state or "").upper()[:2] or None, "metro": metro or None,
            "source": source, "source_keyword": source_keyword,
            "primary_type": category or None, "updated_at": now,
            "niche_id": n.id, "run_id": run_id, "in_crm": already,
        })
    return list(out.values()), stats


def upsert(records, chunk=400, merge=True):
    """merge=True enriches existing rows; merge=False is insert-only. None keys are
    stripped, then rows grouped by key set (PostgREST needs uniform keys per POST)."""
    if not records:
        return []
    stripped = [{k: v for k, v in r.items() if v is not None} for r in records]
    groups = {}
    for r in stripped:
        groups.setdefault(tuple(sorted(r.keys())), []).append(r)

    resolution = "merge-duplicates" if merge else "ignore-duplicates"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
               "Content-Type": "application/json",
               "Prefer": f"resolution={resolution},return=representation"}

    upserted = []
    for group in groups.values():
        for i in range(0, len(group), chunk):
            body = json.dumps(group[i:i + chunk]).encode()
            req = urllib.request.Request(f"{REST}?on_conflict=phone_e164",
                                         data=body, method="POST", headers=headers)
            try:
                with net.urlopen(req, timeout=60) as r:
                    upserted.extend(json.loads(r.read().decode() or "[]"))
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"upsert {e.code}: {e.read().decode()[:300]}") from e
    return upserted


def table_count():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
               "Prefer": "count=exact", "Range": "0-0"}
    req = urllib.request.Request(f"{REST}?select=phone_e164", headers=headers)
    with net.urlopen(req, timeout=30) as r:
        return int(r.headers.get("Content-Range", "*/0").split("/")[-1])
