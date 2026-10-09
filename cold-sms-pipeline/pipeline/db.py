"""The local database. One file per trade: data/leads.db for HVAC (it predates other
trades), data/<trade>.db for the rest, so trades never share searches or leads.

  queries   every city x keyword search, and whether it has run
  listings  every raw Google Maps listing, kept so the rules can be re-run on it
  leads     one row per phone number: the verdict, the sub-category, Twilio's answer,
            and when it went out in a CSV or up to the app. The phone is the key, so a business found
            twice, or by a later run, is never a second lead.
"""

import sqlite3

from .config import DATA

SCHEMA = """
create table if not exists queries (
  id text primary key, query text not null, city text, state text,
  status text not null default 'pending', rows integer, done_at text
);
create table if not exists listings (
  cid text primary key, raw text not null, scraped_at text not null
);
create table if not exists leads (
  phone text primary key, cid text, company_name text, raw_name text,
  city text, state text, timezone text, website text, reviews integer,
  primary_category text, categories text,
  keep integer not null, reason text, service text,
  line_type text, carrier text, looked_up_at text,
  exported_at text, export_file text, created_at text not null,
  uploaded_at text
);
"""

# Columns added after the first run; create table above only covers a fresh file.
ADDED = {"leads": {"uploaded_at": "text"}}


def db_path(trade_name):
    return DATA / ("leads.db" if trade_name == "hvac" else f"{trade_name}.db")


def connect(path):
    DATA.mkdir(exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    for table, columns in ADDED.items():
        have = {r["name"] for r in con.execute(f"pragma table_info({table})")}
        for name, kind in columns.items():
            if name not in have:
                con.execute(f"alter table {table} add column {name} {kind}")
    return con
