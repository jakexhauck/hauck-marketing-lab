"""Build config/cities.json from the Census Bureau's city population estimates.

Incorporated places (cities, villages, towns) in every state, plus Michigan's
townships: Canton, Clinton, Shelby and the rest are big suburbs that are not
incorporated places, and Google Maps searches them by name like any city.
"""

import csv
import io
import json
import re
import urllib.request

from .config import CONFIG

CENSUS_URL = "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv"
STATE_CODES = {"Michigan": "MI", "Ohio": "OH", "Indiana": "IN", "Wisconsin": "WI", "Illinois": "IL"}
TOWNSHIP_STATES = {"MI"}


def search_name(census_name):
    name = census_name.replace(" (balance)", "").strip()
    if re.search(r"\b(charter )?township$", name, re.I):
        return re.sub(r"\s+(charter )?township$", " Township", name, flags=re.I)
    return re.sub(r"\s+(city|village|town|borough)$", "", name, flags=re.I)


def build(min_population, states):
    with urllib.request.urlopen(CENSUS_URL, timeout=60) as resp:
        text = resp.read().decode("latin-1")
    seen, out = set(), []
    for row in csv.DictReader(io.StringIO(text)):
        state = STATE_CODES.get(row["STNAME"])
        if state not in states:
            continue
        pop = int(row["POPESTIMATE2024"] or 0)
        if pop < min_population:
            continue
        is_place = row["SUMLEV"] == "162"
        is_township = (row["SUMLEV"] == "061" and state in TOWNSHIP_STATES
                       and "township" in row["NAME"].lower())
        if not (is_place or is_township):
            continue
        city = search_name(row["NAME"])
        if (city, state) in seen:
            continue
        seen.add((city, state))
        out.append({"city": city, "state": state, "population": pop})
    out.sort(key=lambda c: -c["population"])
    (CONFIG / "cities.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    return out
