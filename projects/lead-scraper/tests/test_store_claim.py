"""Which runs this machine may claim.

A run's place is saved on the disk of the machine that started it
(data/queue_<id>.jsonl). A held or paused run carried on by the OTHER machine
would find no queue file and re-walk every search from the start. So a queued
run with a host goes back to that host, and only a run nobody has touched yet
(host null) is anybody's.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import store  # noqa: E402


class ClaimingARun(unittest.TestCase):
    def setUp(self):
        self.real = store._request
        self.real_env = os.environ.get("LEADS_HOST")
        os.environ["LEADS_HOST"] = "jake-pc"
        self.calls = []

        def fake(method, path, body=None, prefer=None):
            self.calls.append((method, path, body))
            if method == "GET":
                return [{"id": "r1", "status": "queued"}]
            return [{"id": "r1", "status": "running"}]
        store._request = fake

    def tearDown(self):
        store._request = self.real
        if self.real_env is None:
            os.environ.pop("LEADS_HOST", None)
        else:
            os.environ["LEADS_HOST"] = self.real_env

    def test_it_only_asks_for_unclaimed_runs_or_its_own(self):
        store.claim_next_run()
        method, path, _ = self.calls[0]
        self.assertEqual(method, "GET")
        self.assertIn("status=eq.queued", path)
        self.assertIn('or=(host.is.null,host.eq.jake-pc)', path)

    def test_the_claim_itself_keeps_the_same_guard(self):
        store.claim_next_run()
        method, path, body = self.calls[1]
        self.assertEqual(method, "PATCH")
        self.assertIn("status=eq.queued", path)
        self.assertIn('or=(host.is.null,host.eq.jake-pc)', path)
        self.assertEqual(body["status"], "running")


class HoldingIfRunning(unittest.TestCase):
    def setUp(self):
        self.real = store._request
        self.calls = []

        def fake(method, path, body=None, prefer=None):
            self.calls.append((method, path, body))
            return [{"id": "r1"}]
        store._request = fake

    def tearDown(self):
        store._request = self.real

    def test_the_write_only_matches_a_running_row(self):
        self.assertTrue(store.hold_if_running("r1", {"status": "held", "new_count": 3}))
        method, path, body = self.calls[0]
        self.assertEqual(method, "PATCH")
        self.assertIn("id=eq.r1", path)
        self.assertIn("status=eq.running", path)
        self.assertEqual(body["status"], "held")


if __name__ == "__main__":
    unittest.main()
