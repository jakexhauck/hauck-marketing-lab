"""Is this number a mobile, from NANPA's free public data.

NANPA publishes, daily and for nothing, which carrier owns every six-digit NPA-NXX
block in the country. It does not publish a "wireless" flag, so we derive one from
the carrier name: the mobile networks are a short, well known list (T-Mobile, the
Cingular and Cellco estates, MetroPCS, Omnipoint, Boost, US Cellular and friends),
and everything else that owns a block is a landline telco, a cable VoIP arm or a
paging company. That gives a wireless / landline answer per block with no API, no
key and no per-lookup cost.

Two honest limits, both inherent to the free data:
  - It is block level. Every number in an NXX gets the block's answer.
  - It cannot see portability. A number carried from a landline to a mobile still
    reads as its original block, so a real mobile occasionally reads as landline.

Call it 70 to 80% right, which is the trade for free. Numbers whose block is not in
the file at all come back "unknown" rather than being guessed at.

The built map is committed as data/npanxx_line_type.txt.gz so a scrape never has to
reach NANPA. Rebuild it with:  python linetype.py --refresh
"""

from __future__ import annotations

import gzip
import io
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import net

SOURCE_URL = "https://reports.nanpa.com/public/CoCodeAssignment_Utilized_AllStates_Public.zip"
DATA_PATH = Path(__file__).resolve().parent / "data" / "npanxx_line_type.txt.gz"

WIRELESS = "wireless"
LANDLINE = "landline"
UNKNOWN = "unknown"

# Every mobile network that holds blocks in the NANPA file, matched on the carrier
# name it registers them under. The legacy names matter: AT&T's blocks still say
# New Cingular Wireless, Verizon's say Cellco Partnership, and a large slice of
# T-Mobile's say Omnipoint, Powertel, Aerial or SunCom. Checked against the whole
# file: 159 carriers match and none of them is a landline or paging company.
_WIRELESS_CARRIER = re.compile(
    r"WIRELESS|CELLULAR|CELLCO|\bPCS\b|MOBILE"
    r"|OMNIPOINT|POWERTEL|AERIAL COMMUNICATIONS|VOICESTREAM|SUNCOM"
    r"|SPRINT SPECTRUM|NEXTEL|BOOST |USCOC|CRICKET|TRACFONE"
    r"|NTELOS|SHENANDOAH PERSONAL|TELECORP|ALLTEL"
)

_MAP: dict[str, str] | None = None


def _npanxx(e164: str) -> str | None:
    """The six digits NANPA keys on, from a +1 number. Anything else has no answer
    in this data set, so it gets none."""
    digits = re.sub(r"\D", "", e164 or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    return digits[:6]


def load(path: Path | None = None) -> dict[str, str]:
    """The block map, read once and kept. A missing file is not fatal: every lookup
    then answers "unknown", so a machine without the artefact still scrapes."""
    global _MAP
    if _MAP is not None and path is None:
        return _MAP

    target = path or DATA_PATH
    out: dict[str, str] = {}
    if target.exists():
        with gzip.open(target, "rt", encoding="ascii") as fh:
            for line in fh:
                if line.startswith("#"):
                    continue
                code, _, flag = line.strip().partition("\t")
                if len(code) == 6:
                    out[code] = WIRELESS if flag == "W" else LANDLINE
    if path is None:
        _MAP = out
    return out


def line_type_of(e164: str) -> str:
    """'wireless' | 'landline' | 'unknown' for one number."""
    code = _npanxx(e164)
    if not code:
        return UNKNOWN
    return load().get(code, UNKNOWN)


def is_mobile(e164: str) -> bool:
    return line_type_of(e164) == WIRELESS


# --- rebuilding the map ------------------------------------------------------

def build_map(raw: bytes) -> dict[str, str]:
    """NANPA's tab-delimited utilised-codes file to {npanxx: 'W'|'L'}."""
    out: dict[str, str] = {}
    text = io.TextIOWrapper(io.BytesIO(raw), encoding="latin-1")
    for i, line in enumerate(text):
        if i == 0:
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        code = parts[1].strip().replace("-", "")
        if len(code) != 6 or not code.isdigit():
            continue
        company = parts[3].replace('"', "").strip().upper()
        out[code] = "W" if _WIRELESS_CARRIER.search(company) else "L"
    return out


def refresh(url: str = SOURCE_URL, out_path: Path | None = None) -> dict[str, int]:
    """Pull today's file from NANPA and rewrite the committed map."""
    target = out_path or DATA_PATH
    req = urllib.request.Request(url, headers={"User-Agent": "hauck-lead-scraper"})
    with net.urlopen(req, timeout=300) as r:
        payload = r.read()

    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".txt"))
        raw = z.read(name)

    codes = build_map(raw)
    if len(codes) < 100_000:
        raise RuntimeError(f"refusing to write a suspiciously small map ({len(codes)} codes)")

    target.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(f"{code}\t{flag}\n" for code, flag in sorted(codes.items()))
    with gzip.open(target, "wt", encoding="ascii", compresslevel=9) as fh:
        fh.write(f"# NPA-NXX line type derived from {url}\n")
        fh.write(body)

    wireless = sum(1 for v in codes.values() if v == "W")
    return {"codes": len(codes), "wireless": wireless, "landline": len(codes) - wireless}


if __name__ == "__main__":
    if "--refresh" in sys.argv:
        stats = refresh()
        size = DATA_PATH.stat().st_size / 1024
        print(f"{stats['codes']:,} blocks  {stats['wireless']:,} wireless  "
              f"{stats['landline']:,} landline  ->  {DATA_PATH.name} ({size:.0f} KB)")
    else:
        for arg in sys.argv[1:]:
            print(f"{arg}\t{line_type_of(arg)}")
