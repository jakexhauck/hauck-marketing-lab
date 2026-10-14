"""Paths and the per-trade config."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
DATA = ROOT / "data"
OUT = ROOT / "out"


def load_trade(name):
    return json.loads((CONFIG / f"{name}.json").read_text(encoding="utf-8"))


def load_cities():
    return json.loads((CONFIG / "cities.json").read_text(encoding="utf-8"))
