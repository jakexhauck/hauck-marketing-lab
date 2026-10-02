"""Twilio line type: stamps every answer, never pays twice, stops cleanly on a dead account."""

import unittest

from pipeline.db import connect
from pipeline.lookup import LookupStopped, run_lookups


def add(con, phone, keep=1, line=None):
    con.execute("insert into leads (phone, keep, line_type, created_at) values (?,?,?,?)",
                (phone, keep, line, "now"))


def fake(answers):
    calls = []

    def fetch(phone):
        calls.append(phone)
        a = answers[phone]
        if isinstance(a, Exception):
            raise a
        return a

    fetch.calls = calls
    return fetch


class Lookups(unittest.TestCase):
    def setUp(self):
        self.con = connect(":memory:")

    def line(self, phone):
        return self.con.execute("select line_type from leads where phone=?", (phone,)).fetchone()[0]

    def test_stamps_each_answer(self):
        add(self.con, "+1a"); add(self.con, "+1b"); add(self.con, "+1c")
        f = fake({"+1a": (200, "mobile", "T-Mobile"), "+1b": (200, "landline", "AT&T"),
                  "+1c": (404, None, None)})
        stats = run_lookups(self.con, f, workers=1)
        self.assertEqual((self.line("+1a"), self.line("+1b"), self.line("+1c")),
                         ("mobile", "landline", "invalid"))
        self.assertEqual(stats["mobile"], 1)

    def test_only_kept_unchecked_leads_are_looked_up(self):
        add(self.con, "+1a"); add(self.con, "+1b", keep=0); add(self.con, "+1c", line="mobile")
        f = fake({"+1a": (200, "mobile", "x")})
        run_lookups(self.con, f, workers=1)
        self.assertEqual(f.calls, ["+1a"])

    def test_max_caps_spend(self):
        for p in ("+1a", "+1b", "+1c"):
            add(self.con, p)
        f = fake({p: (200, "mobile", "x") for p in ("+1a", "+1b", "+1c")})
        run_lookups(self.con, f, workers=1, max_lookups=2)
        self.assertEqual(len(f.calls), 2)

    def test_account_failure_stops_and_keeps_what_was_done(self):
        add(self.con, "+1a"); add(self.con, "+1b")
        f = fake({"+1a": (200, "mobile", "x"), "+1b": LookupStopped("Twilio said 401")})
        with self.assertRaises(LookupStopped):
            run_lookups(self.con, f, workers=1)
        self.assertEqual(self.line("+1a"), "mobile")
        self.assertIsNone(self.line("+1b"))


if __name__ == "__main__":
    unittest.main()
