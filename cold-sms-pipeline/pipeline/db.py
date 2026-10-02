"""The local database. One file, data/leads.db.

  queries   every city x keyword search, and whether it has run
  listings  every raw Google Maps listing, kept so the rules can be re-run on it
  leads     one row per phone number: the verdict, the sub-category, Twilio's answer,
            and when it went out in a CSV. The phone is the key, so a business found
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
  exported_at text, export_file text, created_at text not null
);
"""


def connect(path=None):
    DATA.mkdir(exist_ok=True)
    con = sqlite3.connect(path or DATA / "leads.db")
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con
