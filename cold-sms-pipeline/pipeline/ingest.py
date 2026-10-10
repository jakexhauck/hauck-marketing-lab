"""Raw Google Maps listings into the leads table."""

import json
from datetime import datetime, timezone

from .filter import judge, service_for
from .text import clean_name, normalize_phone

STATE_CODES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
    "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _state_code(addr):
    s = (addr.get("state") or "").strip()
    return s.upper() if len(s) == 2 else STATE_CODES.get(s.lower(), "")


def _origin(con, row):
    """(city, state) of the search that found this listing. Service-area businesses,
    usually owner-operators working from home, hide their address entirely, and the
    search is then the only place they are known to work."""
    qid = row.get("input_id")
    got = qid and con.execute("select city, state from queries where id=?", (qid,)).fetchone()
    return (got["city"], got["state"]) if got else ("", "")


def verdict(row, trade, origin=("", "")):
    """The judged fields for a listing, everything except the phone and lookups."""
    addr = row.get("complete_address") or {}
    # The search's state stands in only for a hidden address. A Windsor, Ontario shop
    # found by a Detroit search has a state, just not a US one.
    foreign = (addr.get("country") or "US").upper() not in ("US", "USA")
    if foreign or (addr.get("state") or "").strip():
        state = "" if foreign else _state_code(addr) or addr["state"].strip()
    else:
        state = origin[1]
    keep, reason = judge(row, trade)
    if keep and state not in trade["states"]:
        keep, reason = False, f"outside target states: {state or 'unknown'}"
    name = row.get("title") or ""
    return {
        "cid": str(row.get("cid") or row.get("place_id") or ""),
        "company_name": clean_name(name), "raw_name": name,
        "city": (addr.get("city") or "").strip() or origin[0], "state": state,
        "timezone": row.get("timezone") or "", "website": row.get("web_site") or "",
        "reviews": row.get("review_count") or 0,
        "primary_category": row.get("category") or "",
        "categories": json.dumps(row.get("categories") or []),
        "keep": int(keep), "reason": reason, "service": service_for(name, trade),
    }


def ingest(con, rows, trade):
    stats = {"listings": 0, "no_phone": 0, "duplicate": 0, "new": 0, "kept": 0}
    now = _now()
    with con:
        for row in rows:
            stats["listings"] += 1
            cid = str(row.get("cid") or row.get("place_id") or "")
            if cid:
                con.execute("insert or replace into listings (cid, raw, scraped_at) values (?,?,?)",
                            (cid, json.dumps(row), now))
            phone = normalize_phone(row.get("phone"))
            if not phone:
                stats["no_phone"] += 1
                continue
            if con.execute("select 1 from leads where phone=?", (phone,)).fetchone():
                stats["duplicate"] += 1
                continue
            v = verdict(row, trade, _origin(con, row))
            con.execute(
                f"insert into leads (phone, created_at, {', '.join(v)}) "
                f"values (?, ?, {', '.join('?' * len(v))})",
                (phone, now, *v.values()))
            stats["new"] += 1
            stats["kept"] += v["keep"]
    return stats


def reprocess(con, trade):
    """Re-judge every stored lead from its raw listing after a rule change.
    Twilio answers and export stamps are left alone."""
    changed = 0
    with con:
        for lead in con.execute("select phone, cid, keep, service from leads").fetchall():
            got = con.execute("select raw from listings where cid=?", (lead["cid"],)).fetchone()
            if not got:
                continue
            row = json.loads(got["raw"])
            v = verdict(row, trade, _origin(con, row))
            if (v["keep"], v["service"]) != (lead["keep"], lead["service"]):
                changed += 1
            con.execute(
                "update leads set keep=?, reason=?, service=?, company_name=?, city=?, state=? where phone=?",
                (v["keep"], v["reason"], v["service"], v["company_name"], v["city"], v["state"],
                 lead["phone"]))
    return changed
