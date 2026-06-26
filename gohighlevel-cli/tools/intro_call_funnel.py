#!/usr/bin/env python3
"""Audit / re-point the "Intro Call" confirmation funnel in any GHL subaccount.

The funnel is a tag-chained, two-stage set of workflows:

  Stage 1 (booking)      customer_appointment trigger on a calendar -> adds a "booked" tag
  Stage 2 (confirmation) tag trigger -> SMS/email confirmations -> on confirm-link click a
                         custom webhook PUTs the appointment title to "CONFIRMED", which GHL's
                         native Google Calendar sync pushes to the Google event ("flip the title")

Most of the funnel copies cleanly via a GHL snapshot. The values a snapshot CANNOT carry
correctly are what this tool checks (and optionally fixes):

  1. the calendar each Stage-1 trigger points at  (per-subaccount calendar IDs)
  2. the Private Integration Token hard-coded in the Stage-2 "flip title" webhook header
  3. the per-client custom values the messages depend on

It DISCOVERS workflows by shape (trigger type + presence of the flip webhook), so it works on a
freshly-duplicated account with brand-new IDs. It never touches workflow status or trigger
`active` flags, so it cannot turn the funnel on.

Usage (run from the gohighlevel-cli dir, with .env loaded so GHL_FIREBASE_REFRESH_TOKEN is set):

  # read-only audit of the test subaccount
  python tools/intro_call_funnel.py audit --location r0WfsA12qpBv7M185V3v --pit pit-xxxx

  # show what a re-point would change (dry run, default)
  python tools/intro_call_funnel.py repoint --location <loc> --pit pit-xxxx

  # actually write the re-point (calendar IDs + webhook PIT)
  python tools/intro_call_funnel.py repoint --location <loc> --pit pit-xxxx --apply

--pit is that subaccount's own Private Integration Token. It is used for public reads
(calendars, custom values) and is the token the flip webhook should carry.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
import ssl

# Make the package importable when run from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cli_anything.gohighlevel.utils.ghl_internal_client import TokenManager, InternalGHLClient  # noqa: E402

PUBLIC = "https://services.leadconnectorhq.com"
CTX = ssl.create_default_context()
CV_RE = re.compile(r"custom_values\.([a-zA-Z0-9_]+)")
APPT_WEBHOOK_RE = re.compile(r"/calendars/events/appointments/", re.I)

# Which calendar role a Stage-1 workflow expects, inferred from the tag it adds.
def role_for_tag(tag: str) -> str:
    t = (tag or "").lower()
    if "2nd chance" in t or "second chance" in t:
        return "2nd Chance"
    if "home estimate" in t:
        return "Home Estimate"
    return "Intro Call"

# Match a calendar name to a role (used when re-pointing).
def calendar_matches_role(cal_name: str, role: str) -> bool:
    n = (cal_name or "").lower()
    if role == "2nd Chance":
        return "2nd chance" in n or "second chance" in n
    if role == "Home Estimate":
        return "home estimate" in n
    # Intro Call: the primary intro calendar, NOT the 2nd chance one
    return "intro call" in n and "2nd" not in n and "second" not in n


def public_get(path: str, pit: str, version: str, params: dict | None = None):
    """Public GHL REST GET using the subaccount's PIT. Uses requests if available
    (passes Cloudflare); falls back to urllib."""
    qs = ""
    if params:
        qs = "?" + "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{PUBLIC}{path}{qs}"
    headers = {"Authorization": f"Bearer {pit}", "Version": version, "Accept": "application/json"}
    try:
        import requests  # type: ignore
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json()
    except ImportError:
        req = urllib.request.Request(url, headers={**headers, "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            return json.loads(resp.read().decode())


def fetch_calendars(loc: str, pit: str) -> list[dict]:
    data = public_get("/calendars/", pit, "2021-04-15", {"locationId": loc})
    return data.get("calendars", data) if isinstance(data, dict) else data


def fetch_custom_values(loc: str, pit: str) -> set[str]:
    try:
        data = public_get(f"/locations/{loc}/customValues", pit, "2021-07-28")
        items = data.get("customValues", []) if isinstance(data, dict) else (data or [])
        out = set()
        for cv in items:
            # GHL exposes a fieldKey like "custom_values.email_from_name"
            fk = cv.get("fieldKey") or ""
            out.add(fk.split(".")[-1])
            if cv.get("name"):
                out.add(cv["name"].strip().lower().replace(" ", "_"))
        return out
    except Exception:
        return set()


def fetch_steps(workflow_doc: dict) -> list[dict]:
    url = workflow_doc.get("fileUrl")
    if not url:
        return (workflow_doc.get("workflowData") or {}).get("templates", [])
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            return json.loads(resp.read().decode()).get("templates", [])
    except Exception:
        return []


def find_flip_webhook(steps: list[dict]) -> dict | None:
    for s in steps:
        if s.get("type") != "webhook":
            continue
        attrs = s.get("attributes", {})
        if APPT_WEBHOOK_RE.search(str(attrs.get("url", ""))):
            return s
    return None


def webhook_pit(step: dict) -> str | None:
    for h in step.get("attributes", {}).get("headers", []):
        if h.get("key", "").lower() == "authorization":
            v = h.get("value", "")
            m = re.search(r"Bearer\s+(pit-[\w-]+)", v)
            return m.group(1) if m else v
    return None


def collect_custom_values(steps: list[dict]) -> set[str]:
    blob = json.dumps(steps, ensure_ascii=False)
    return set(CV_RE.findall(blob))


def classify(loc: str, client: InternalGHLClient, w: dict) -> dict:
    wid = w["_id"]
    trigs = client.request("GET", f"/workflow/{loc}/trigger?workflowId={wid}")
    trigs = trigs if isinstance(trigs, list) else []
    steps = fetch_steps(w)
    flip = find_flip_webhook(steps)
    appt_trigs = []
    tag_trigs = []
    for t in trigs:
        cal = None
        tag = None
        for cond in t.get("conditions", []):
            if cond.get("field") == "calendar.id":
                cal = cond.get("value")
            if cond.get("field") == "tagsAdded":
                tag = cond.get("value")
        if t.get("type") == "customer_appointment" or cal:
            appt_trigs.append({"trigger": t, "calendar_id": cal})
        if tag:
            tag_trigs.append({"trigger": t, "tag": tag})
    added = []
    for s in steps:
        if s.get("type") == "add_contact_tag":
            added += s.get("attributes", {}).get("tags", [])
    return {
        "id": wid,
        "name": w.get("name", ""),
        "status": w.get("status"),
        "appt_triggers": appt_trigs,
        "tag_triggers": tag_trigs,
        "adds_tags": added,
        "flip_step": flip,
        "flip_pit": webhook_pit(flip) if flip else None,
        "custom_values": collect_custom_values(steps),
        "steps": steps,
        "doc": w,
    }


def audit(loc: str, pit: str | None, expected_pit: str | None):
    client = InternalGHLClient(TokenManager(), loc)
    wfs = client.request("GET", f"/workflow/{loc}")
    if not isinstance(wfs, list):
        print("ERROR: could not list workflows (check Firebase token in .env).")
        return 1
    funnel = [w for w in wfs if "intro call" in w.get("name", "").lower()]
    print(f"\nFunnel workflows found in {loc}: {len(funnel)}\n" + "=" * 78)

    cals = []
    cal_by_id = {}
    defined_cvs = set()
    if pit:
        try:
            cals = fetch_calendars(loc, pit)
            cal_by_id = {c.get("id"): c.get("name") for c in cals}
            defined_cvs = fetch_custom_values(loc, pit)
        except Exception as e:
            print(f"WARNING: public reads failed with the provided PIT ({e}).")
            print("         Calendar-name and custom-value checks will be skipped.\n")

    expected_pit = expected_pit or pit
    all_cvs = set()
    flags = []

    for w in sorted(funnel, key=lambda x: x.get("name", "")):
        info = classify(loc, client, w)
        all_cvs |= info["custom_values"]
        print(f"\n{info['name']}  [{info['id']}]  status={info['status']}")

        for at in info["appt_triggers"]:
            cid = at["calendar_id"]
            cname = cal_by_id.get(cid, "(unknown / not in this account)" if pit else "(provide --pit to resolve)")
            role = role_for_tag(info["adds_tags"][0] if info["adds_tags"] else info["name"])
            stale = pit and cid not in cal_by_id
            mismatch = pit and (cid in cal_by_id) and not calendar_matches_role(cname, role)
            mark = "  <-- STALE (calendar not in account)" if stale else ("  <-- MISMATCH" if mismatch else "")
            print(f"   booking trigger -> calendar {cid}  = {cname}   (expects: {role}){mark}")
            if stale:
                flags.append(f"{info['name']}: trigger points at missing calendar {cid}")
            if mismatch:
                flags.append(f"{info['name']}: calendar '{cname}' does not match expected role '{role}'")

        for tt in info["tag_triggers"]:
            print(f"   tag trigger     -> on tag '{tt['tag']}'")

        if info["flip_step"]:
            pit_ok = (info["flip_pit"] == expected_pit) if expected_pit else None
            mark = "" if pit_ok is None else ("  OK" if pit_ok else "  <-- WRONG TOKEN for this subaccount")
            print(f"   flip webhook    -> PIT {info['flip_pit']}{mark}")
            if expected_pit and not pit_ok:
                flags.append(f"{info['name']}: flip-webhook PIT is not this subaccount's token")

    print("\n" + "=" * 78)
    print("CUSTOM VALUES the funnel references (must exist in the subaccount):")
    for cv in sorted(all_cvs):
        status = ""
        if pit and defined_cvs:
            status = "  OK" if cv in defined_cvs else "  <-- MISSING / not set"
            if cv not in defined_cvs:
                flags.append(f"custom value not set: {cv}")
        print(f"   custom_values.{cv}{status}")

    print("\n" + "=" * 78)
    if flags:
        print(f"{len(flags)} issue(s) to fix before this funnel will work:")
        for f in flags:
            print(f"   - {f}")
    else:
        print("No wiring issues detected" + (" (within the checks the PIT allowed)." if not pit else "."))
    print()
    return 0


def repoint(loc: str, pit: str, expected_pit: str | None, apply: bool):
    """Re-point Stage-1 trigger calendars (by role) and replace the flip-webhook PIT."""
    expected_pit = expected_pit or pit
    client = InternalGHLClient(TokenManager(), loc)
    cals = fetch_calendars(loc, pit)
    cal_by_id = {c.get("id"): c.get("name") for c in cals}
    wfs = client.request("GET", f"/workflow/{loc}")
    funnel = [w for w in wfs if "intro call" in w.get("name", "").lower()]
    mode = "APPLYING" if apply else "DRY RUN (use --apply to write)"
    print(f"\nRe-point {loc} -- {mode}\n" + "=" * 78)

    for w in funnel:
        info = classify(loc, client, w)

        # 1. calendar triggers
        for at in info["appt_triggers"]:
            cid = at["calendar_id"]
            role = role_for_tag(info["adds_tags"][0] if info["adds_tags"] else info["name"])
            if cid in cal_by_id and calendar_matches_role(cal_by_id[cid], role):
                continue  # already correct
            target = next((c for c in cals if calendar_matches_role(c.get("name", ""), role)), None)
            if not target:
                print(f"   {info['name']}: no calendar matches role '{role}' -- SKIP")
                continue
            print(f"   {info['name']}: calendar {cid} -> {target['id']} ({target['name']})")
            if apply:
                trig = at["trigger"]
                for cond in trig.get("conditions", []):
                    if cond.get("field") == "calendar.id":
                        cond["value"] = target["id"]
                client.request("PUT", f"/workflow/{loc}/trigger/{trig['id']}", trig)

        # 2. flip webhook PIT
        if info["flip_step"] and expected_pit and info["flip_pit"] != expected_pit:
            print(f"   {info['name']}: flip-webhook PIT {info['flip_pit']} -> {expected_pit}")
            if apply:
                for h in info["flip_step"].get("attributes", {}).get("headers", []):
                    if h.get("key", "").lower() == "authorization":
                        h["value"] = f"Bearer {expected_pit}"
                client.request(
                    "PUT", f"/workflow/{loc}/{info['id']}",
                    {"name": info["name"], "version": info["doc"].get("version", 2),
                     "workflowData": {"templates": info["steps"]}},
                )

    print("\nDone." + ("" if apply else " (nothing written -- dry run.)"))
    print("Note: status and trigger active-flags are left untouched; this never turns the funnel on.\n")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Audit / re-point the Intro Call confirmation funnel.")
    ap.add_argument("mode", choices=["audit", "repoint"], help="audit (read-only) or repoint")
    ap.add_argument("--location", required=True, help="target subaccount location ID")
    ap.add_argument("--pit", help="that subaccount's Private Integration Token (for public reads + the webhook token)")
    ap.add_argument("--expected-flip-pit", help="what the flip-webhook PIT should be (defaults to --pit)")
    ap.add_argument("--apply", action="store_true", help="(repoint) actually write changes")
    args = ap.parse_args()

    if args.mode == "audit":
        return audit(args.location, args.pit, args.expected_flip_pit)
    if not args.pit:
        print("repoint requires --pit (the subaccount's token).")
        return 1
    return repoint(args.location, args.pit, args.expected_flip_pit, args.apply)


if __name__ == "__main__":
    sys.exit(main())
