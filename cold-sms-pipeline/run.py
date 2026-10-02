"""Cold SMS lead pipeline. Run from this folder.

  python run.py cities                       rebuild config/cities.json from the Census
  python run.py scrape [--state MI] [--max-queries N]
  doppler run --project hauck-command-center --config prd -- python run.py lookup [--max N]
  python run.py export [--dry-run]           the CSV for GHL, in out/
  python run.py test-csv --phone 2485550134 [--phone ...]
  python run.py reprocess                    re-judge stored leads after a rule change
  python run.py status
"""

import argparse
import sys

from pipeline.cities import build as build_cities
from pipeline.config import CONFIG, OUT, load_cities, load_trade
from pipeline.db import connect
from pipeline.export import TemplateError, export, write_test_csv
from pipeline.ingest import reprocess
from pipeline.lookup import PRICE, LookupStopped, pending, run_lookups, twilio_fetcher
from pipeline.scrape import ScrapeStopped, plan_queries, scrape
from pipeline.text import split_messages


def status(con, trade):
    q = dict(con.execute("select status, count(*) from queries group by status").fetchall())
    one = lambda sql: con.execute(sql).fetchone()[0]
    print(f"Searches: {q.get('done', 0)} done, {q.get('pending', 0)} to go")
    print(f"Numbers found: {one('select count(*) from leads')}")
    print(f"  kept: {one('select count(*) from leads where keep=1')}")
    print(f"  waiting for Twilio: {one('select count(*) from leads where keep=1 and line_type is null')}")
    for row in con.execute("select line_type, count(*) n from leads where keep=1 and line_type is not null "
                           "group by line_type order by n desc"):
        print(f"  {row[0]}: {row[1]}")
    print(f"  exported: {one('select count(*) from leads where exported_at is not null')}")
    for row in con.execute("select service, count(*) from leads where keep=1 group by service"):
        print(f"  service {row[0]}: {row[1]}")


def main(argv=None):
    p = argparse.ArgumentParser(description="Cold SMS lead pipeline")
    p.add_argument("--trade", default="hvac")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cities"); c.add_argument("--min-population", type=int, default=20000)
    s = sub.add_parser("scrape"); s.add_argument("--state", action="append"); s.add_argument("--max-queries", type=int)
    l = sub.add_parser("lookup"); l.add_argument("--max", type=int)
    e = sub.add_parser("export"); e.add_argument("--dry-run", action="store_true")
    t = sub.add_parser("test-csv"); t.add_argument("--phone", action="append", required=True)
    sub.add_parser("reprocess"); sub.add_parser("status")
    args = p.parse_args(argv)

    trade = load_trade(args.trade)
    con = connect()

    if args.cmd == "cities":
        cities = build_cities(args.min_population, set(trade["states"]))
        print(f"{len(cities)} cities over {args.min_population:,} written to config/cities.json")

    elif args.cmd == "scrape":
        states = set(args.state) if args.state else None
        added = plan_queries(con, trade, load_cities(), states)
        print(f"Queued {added} new searches.")
        try:
            totals = scrape(con, trade, max_queries=args.max_queries)
        except ScrapeStopped as err:
            print(f"STOPPED: {err}")
            return 1
        print(f"Done: {totals}")

    elif args.cmd == "lookup":
        todo = len(pending(con, args.max))
        print(f"{todo} numbers to check, about ${todo * PRICE:.2f} of Twilio credit.")
        try:
            stats = run_lookups(con, twilio_fetcher(), max_lookups=args.max,
                                progress=lambda n, of: print(f"  {n}/{of}"))
        except LookupStopped as err:
            print(f"STOPPED: {err}\nEverything checked before this is saved; run lookup again to resume.")
            return 1
        print(f"Done: {stats}")

    elif args.cmd == "export":
        msg_file = CONFIG / "messages.txt"
        messages = split_messages(msg_file.read_text(encoding="utf-8")) if msg_file.exists() else []
        if not messages:
            print("No texts in config/messages.txt yet: checking company name, city and service only.")
        try:
            result = export(con, trade, messages, OUT, dry_run=args.dry_run)
        except TemplateError as err:
            print(f"STOPPED: {err}")
            return 1
        print(f"{result['count']} leads in {result['csv'] or '(no CSV, nothing new)'}")
        if result["skipped"]:
            print(f"{len(result['skipped'])} skipped, reasons in {result['skipped_csv']}")
        if args.dry_run:
            print("Dry run: nothing marked as exported.")

    elif args.cmd == "test-csv":
        print(f"Test CSV: {write_test_csv(trade, args.phone, OUT)}")

    elif args.cmd == "reprocess":
        print(f"{reprocess(con, trade)} leads changed verdict or service.")

    elif args.cmd == "status":
        status(con, trade)
    return 0


if __name__ == "__main__":
    sys.exit(main())
