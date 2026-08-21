"""A phone in data/suppression.txt is already committed to an outreach channel
and must NEVER export again, regardless of send_status / score / requalification.
No env/DB dependency in the reading and writing, so the exporter and tests can
enforce it offline. One E.164 per line; '#' comments ignored.

Verbatim from the SOP, plus the way in. The SOP left this as two functions and no
caller: nothing anywhere reached merge_suppressed, so an opt-out was a hand edit of
a text file, on the one path where a mistake means texting somebody who asked you
not to. Run it as a command instead:

    python suppress.py +12065550142 "(206) 555-0143" add numbers, stamp them in the DB
    python suppress.py --file numbers.txt            one number per line
    python suppress.py --list                        print the list
    python suppress.py --sync                        pull the DB's opt-outs into the file
    python suppress.py +1... --no-db                 file only, no network

The file and the database are both written on purpose. The file is what the CSV
exporter reads offline; the send_status stamp is what the Leads page, the send
paths and the power dialer read. One command has to reach both, or an opt-out
honoured by the CSV still rings on the dialer.
"""

from __future__ import annotations

import sys
from pathlib import Path

SUPPRESSION_FILE = Path(__file__).resolve().parent / "data" / "suppression.txt"

# The stamp an opted-out row carries. Unlike a regrade, this one is written over
# ANY send_status, including a row already sent: "do not contact" outranks every
# other thing the table can say about a number.
DO_NOT_CONTACT = "do_not_contact"

# The header is the only thing that says what the file is, why it is in git, and
# what happens to a number in it. Rewriting the file from the numbers alone erased
# it, which is why it is carried across explicitly.
USAGE = """python suppress.py +12065550142 "(206) 555-0143"   add numbers, stamp them in the DB
python suppress.py --file numbers.txt                one number per line
python suppress.py --list                            print the list
python suppress.py --sync                            pull the DB's opt-outs into the file
python suppress.py +12065550142 --no-db              file only, no network"""

DEFAULT_HEADER = [
    "# Permanent do-not-contact list. One E.164 number per line.",
    "# A phone in here NEVER exports again, regardless of score, send_status or a",
    "# requalification. This file is tracked in git on purpose: losing it means texting",
    "# someone who already opted out.",
    "#",
    "# Add one:  python suppress.py +12065550142",
]


def load_suppressed(path=None):
    p = path or SUPPRESSION_FILE
    if not p.exists():
        return frozenset()
    return frozenset(l.strip() for l in p.read_text().splitlines()
                     if l.strip() and not l.startswith("#"))


def _header_of(path):
    """The comment lines already in the file, or the default for a new one."""
    if not path.exists():
        return list(DEFAULT_HEADER)
    kept = [l.rstrip() for l in path.read_text().splitlines() if l.startswith("#")]
    return kept or list(DEFAULT_HEADER)


def merge_suppressed(phones, path=None):
    p = path or SUPPRESSION_FILE
    existing = set(load_suppressed(p))
    before = len(existing)
    header = _header_of(p)
    merged = existing | {ph.strip() for ph in phones if ph and ph.strip()}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(header + [""] + sorted(merged)) + "\n")
    return len(merged) - before, len(merged)


def parse_numbers(raw_numbers, region="US"):
    """(accepted E.164, rejected as typed). A typo is refused, never stored: a
    number stored wrong is a number still being texted, and nobody finds out."""
    import phonenumbers

    good, bad = [], []
    for raw in raw_numbers:
        raw = (raw or "").strip()
        if not raw:
            continue
        try:
            num = phonenumbers.parse(raw, region)
            if not phonenumbers.is_valid_number(num):
                raise ValueError(raw)
            e164 = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except Exception:
            bad.append(raw)
            continue
        if e164 not in good:
            good.append(e164)
    return good, bad


# --- the database half -------------------------------------------------------
# Imported lazily so the file half stays offline and env-free.

def stamp_do_not_contact(phones):
    """Mark every matching row do_not_contact. Returns how many rows were stamped.

    Deliberately not limited to pending rows, which is the rule everywhere else:
    a regrade must not rewrite the history of a sent number, but an opt-out must.
    """
    import json
    import urllib.parse
    import urllib.request

    import net
    from pipeline import REST, SUPABASE_KEY

    hdrs = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json", "Prefer": "return=representation"}
    body = json.dumps({"send_status": DO_NOT_CONTACT}).encode()
    stamped = 0
    for i in range(0, len(phones), 100):
        vals = ",".join(urllib.parse.quote(p, safe="") for p in phones[i:i + 100])
        req = urllib.request.Request(f"{REST}?phone_e164=in.({vals})",
                                     data=body, method="PATCH", headers=hdrs)
        with net.urlopen(req, timeout=60) as r:
            stamped += len(json.loads(r.read().decode() or "[]"))
    return stamped


def db_suppressed():
    """Every phone the DB already has stamped do_not_contact."""
    import json
    import urllib.request

    import net
    from pipeline import REST, SUPABASE_KEY

    hdrs = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    out, offset = [], 0
    while True:
        url = (f"{REST}?select=phone_e164&send_status=eq.{DO_NOT_CONTACT}"
               f"&order=phone_e164.asc&limit=1000&offset={offset}")
        with net.urlopen(urllib.request.Request(url, headers=hdrs), timeout=60) as r:
            rows = json.loads(r.read().decode() or "[]")
        out += [row["phone_e164"] for row in rows if row.get("phone_e164")]
        if len(rows) < 1000:
            return out
        offset += 1000


def main(argv):
    argv = list(argv)
    no_db = "--no-db" in argv
    if no_db:
        argv.remove("--no-db")

    if "--list" in argv:
        numbers = sorted(load_suppressed())
        for n in numbers:
            print(n)
        print(f"{len(numbers)} suppressed", file=sys.stderr)
        return 0

    if "--sync" in argv:
        from_db = db_suppressed()
        added, total = merge_suppressed(from_db)
        print(f"synced {len(from_db)} from the database: {added} new, {total} suppressed")
        return 0

    raw = []
    if "--file" in argv:
        i = argv.index("--file")
        path = Path(argv[i + 1])
        raw += [l.strip() for l in path.read_text().splitlines()
                if l.strip() and not l.startswith("#")]
        del argv[i:i + 2]
    raw += [a for a in argv if not a.startswith("--")]

    if not raw:
        print(USAGE, file=sys.stderr)
        return 2

    good, bad = parse_numbers(raw)
    for b in bad:
        print(f"not a valid number, ignored: {b}", file=sys.stderr)
    if not good:
        print("nothing to suppress", file=sys.stderr)
        return 1

    added, total = merge_suppressed(good)
    print(f"{added} added, {total} on the do-not-contact list")
    if not no_db:
        stamped = stamp_do_not_contact(good)
        print(f"{stamped} lead rows stamped {DO_NOT_CONTACT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
