"""Which searches a scrape runs."""

import unittest

from pipeline.db import connect
from pipeline.scrape import pending_queries, plan_queries

TRADE = {"keywords": ["hvac contractor"]}
CITIES = [{"city": "Troy", "state": "MI"}, {"city": "Toledo", "state": "OH"}]


class Pending(unittest.TestCase):
    def setUp(self):
        self.con = connect(":memory:")
        plan_queries(self.con, TRADE, CITIES)

    def test_state_limits_what_runs_not_just_what_is_queued(self):
        self.assertEqual([q["state"] for q in pending_queries(self.con, {"MI"})], ["MI"])

    def test_no_state_runs_everything(self):
        self.assertEqual(len(pending_queries(self.con)), 2)

    def test_done_searches_never_rerun(self):
        self.con.execute("update queries set status='done' where state='MI'")
        self.assertEqual(pending_queries(self.con, {"MI"}), [])


if __name__ == "__main__":
    unittest.main()
