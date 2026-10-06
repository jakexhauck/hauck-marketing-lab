"""Twilio Lookup v2, line type intelligence. About $0.008 a number.

Only kept leads that have never been checked are looked up, and every answer is saved
straight away, so a number is never paid for twice and a run that stops halfway
loses nothing. Keys come from the environment: run it under `doppler run`.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

URL = "https://lookups.twilio.com/v2/PhoneNumbers/{}?Fields=line_type_intelligence"
PRICE = 0.008
OUT_OF_CREDIT = 60627


class LookupStopped(Exception):
    """Twilio refused for a reason retrying will not fix: bad keys, no credit, suspended."""


def answer(body):
    """One Lookup reply as (status, type, carrier).

    Twilio answers 200 even when it could not check the line, with the error only inside
    the body. 60627 is no credit: saving that as "unknown" would burn the number for good,
    so it stops the run. Any other code is about this one number (60601 = no data, e.g. a
    Canadian number), so it is saved as "unknown" and never texted.
    """
    if not body.get("valid", True):
        return 404, None, None
    lti = body.get("line_type_intelligence") or {}
    if lti.get("error_code") == OUT_OF_CREDIT:
        raise LookupStopped(f"Twilio is out of credit (error {OUT_OF_CREDIT}).")
    return 200, lti.get("type") or "unknown", lti.get("carrier_name")


def twilio_fetcher():
    sid, token = os.environ.get("TWILIO_ACCOUNT_SID"), os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise LookupStopped("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set. Run under: "
                            "doppler run --project hauck-command-center --config prd -- ...")
    auth = "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()

    def fetch(phone):
        for attempt in range(5):
            req = urllib.request.Request(URL.format(phone), headers={"Authorization": auth})
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    return answer(json.loads(resp.read()))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return 404, None, None
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                detail = e.read().decode(errors="replace")[:300]
                raise LookupStopped(f"Twilio said {e.code}: {detail}") from None
            except urllib.error.URLError:
                time.sleep(2 ** attempt)
        raise LookupStopped(f"Twilio kept failing on {phone}; stopped.")

    return fetch


def pending(con, max_lookups=None):
    sql = "select phone from leads where keep=1 and line_type is null order by state, city"
    if max_lookups:
        sql += f" limit {int(max_lookups)}"
    return [r["phone"] for r in con.execute(sql)]


def run_lookups(con, fetch, workers=5, max_lookups=None, progress=None):
    phones = pending(con, max_lookups)
    stats = {"checked": 0}
    now = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")

    def save(phone, answer):
        status, kind, carrier = answer
        kind = kind if status == 200 else "invalid"
        with con:
            con.execute("update leads set line_type=?, carrier=?, looked_up_at=? where phone=?",
                        (kind, carrier, now(), phone))
        stats["checked"] += 1
        stats[kind] = stats.get(kind, 0) + 1
        if progress and stats["checked"] % 100 == 0:
            progress(stats["checked"], len(phones))

    # Answers are written on this thread only; sqlite connections are not shared.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i in range(0, len(phones), 50):
            chunk = phones[i:i + 50]
            for phone, answer in zip(chunk, pool.map(fetch, chunk)):
                save(phone, answer)
    return stats
