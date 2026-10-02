"""The CSV: only checked mobiles, no blanks in any text, GSM-7 only, never twice."""

import csv
import tempfile
import unittest
from pathlib import Path

from pipeline.config import load_trade
from pipeline.db import connect
from pipeline.export import TemplateError, export, test_rows

T = load_trade("hvac")
MESSAGES = ["Hey, quick one for {{contact.company_name}} in {{contact.city}}.",
            "We book {{contact.service}} replacements."]


def add(con, phone, name="Koz Heating", city="Troy", line="mobile", keep=1, service="AC and furnace"):
    con.execute(
        "insert into leads (phone, company_name, city, state, timezone, website, keep, service, "
        "line_type, created_at) values (?,?,?,?,?,?,?,?,?,?)",
        (phone, name, city, "MI", "America/Detroit", "https://k.com", keep, service, line, "now"))


class Export(unittest.TestCase):
    def setUp(self):
        self.con = connect(":memory:")
        self.dir = Path(tempfile.mkdtemp())

    def run_export(self, messages=MESSAGES):
        return export(self.con, T, messages, self.dir, stamp="20261002_1200")

    def rows(self, path):
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def test_good_lead_goes_out_with_the_ghl_columns(self):
        add(self.con, "+12485550134")
        result = self.run_export()
        [row] = self.rows(result["csv"])
        self.assertEqual(row["Phone"], "+12485550134")
        self.assertEqual(row["Company Name"], "Koz Heating")
        self.assertEqual(row["service"], "AC and furnace")
        self.assertEqual(row["Timezone"], "America/Detroit")
        self.assertIn("cold-sms-hvac", row["Tags"])

    def test_website_loses_tracking_params(self):
        add(self.con, "+12485550134")
        self.con.execute("update leads set website='https://k.com/?utm_source=google'")
        [row] = self.rows(self.run_export()["csv"])
        self.assertEqual(row["Website"], "https://k.com/")

    def test_landline_and_unchecked_and_dropped_stay_out(self):
        add(self.con, "+12485550001", line="landline")
        add(self.con, "+12485550002", line=None)
        add(self.con, "+12485550003", keep=0)
        self.assertIsNone(self.run_export()["csv"])

    def test_blank_field_is_skipped_with_reason(self):
        add(self.con, "+12485550134", city="")
        result = self.run_export()
        self.assertIsNone(result["csv"])
        [skip] = result["skipped"]
        self.assertIn("city", skip["reason"])

    def test_never_exported_twice(self):
        add(self.con, "+12485550134")
        self.run_export()
        self.assertIsNone(export(self.con, T, MESSAGES, self.dir, stamp="20261002_1300")["csv"])

    def test_dry_run_stamps_nothing(self):
        add(self.con, "+12485550134")
        export(self.con, T, MESSAGES, self.dir, stamp="x", dry_run=True)
        self.assertIsNotNone(self.run_export()["csv"])

    def test_non_gsm_name_is_skipped(self):
        add(self.con, "+12485550134", name="Cool Air \U0001F600")
        result = self.run_export()
        self.assertIsNone(result["csv"])
        self.assertIn("GSM", result["skipped"][0]["reason"])

    def test_curly_quote_in_template_stops_everything(self):
        add(self.con, "+12485550134")
        with self.assertRaises(TemplateError):
            self.run_export(["It’s {{contact.city}}"])

    def test_no_messages_yet_still_checks_the_three_fields(self):
        add(self.con, "+12485550134", service="")
        result = self.run_export([])
        self.assertIsNone(result["csv"])
        self.assertIn("service", result["skipped"][0]["reason"])


class TestRows(unittest.TestCase):
    def test_test_numbers_carry_the_real_tag_and_a_test_tag(self):
        [row] = test_rows(T, ["(248) 555-0134"])
        self.assertEqual(row["Phone"], "+12485550134")
        self.assertIn("cold-sms-hvac", row["Tags"])
        self.assertIn("cold-sms-test", row["Tags"])


if __name__ == "__main__":
    unittest.main()
