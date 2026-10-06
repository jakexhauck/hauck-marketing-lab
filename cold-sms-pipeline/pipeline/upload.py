"""Checked leads into the app's Cold SMS > Leads tab (Supabase `cold_sms_leads`).

The same leads `export` would put in a CSV, minus anything already in one. Jake picks
and downloads from the app after this; the pipeline stops at the upload. Sent in
chunks, each marked `uploaded_at` as it lands, so a failure part way keeps what got
there and a rerun sends only the rest. A phone already in the table is ignored, not
overwritten: once a lead is in the app, the app owns whether it has gone out.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

from .export import checked, clean_website

CHUNK = 500


class UploadStopped(Exception):
    pass


def app_row(lead, trade):
    return {
        "phone": lead["phone"], "company_name": lead["company_name"], "city": lead["city"],
        "state": lead["state"], "timezone": lead["timezone"],
        "website": clean_website(lead["website"]), "service": lead["service"],
        "line_type": lead["line_type"], "trade": trade["trade"],
    }


def upload(con, trade, messages, post, chunk=CHUNK):
    leads, skipped = checked(con, trade, messages, where="exported_at is null and uploaded_at is null")
    for i in range(0, len(leads), chunk):
        part = leads[i:i + chunk]
        post([app_row(lead, trade) for lead in part])
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with con:
            con.executemany("update leads set uploaded_at=? where phone=?",
                            [(now, lead["phone"]) for lead in part])
    return {"count": len(leads), "skipped": skipped}


def supabase_poster():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise UploadStopped("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Run under: "
                            "doppler run --project hauck-command-center --config prd -- ...")
    endpoint = f"{url.rstrip('/')}/rest/v1/cold_sms_leads?on_conflict=phone"
    headers = {
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }

    def post(rows):
        req = urllib.request.Request(endpoint, data=json.dumps(rows).encode(), headers=headers,
                                     method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60):
                pass
        except urllib.error.HTTPError as err:
            raise UploadStopped(f"Supabase said {err.code}: {err.read().decode()[:300]}") from err

    return post
