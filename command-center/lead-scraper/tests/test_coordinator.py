"""The off switch, and what it does to a run that was already claimed.

On 2026-08-20 a run sat at 'running' on the Leads page with no process anywhere
working it: the switch fired inside run_job AFTER --watch had claimed the row, and
returning early left the claim behind. A stopped run has to go back on the queue,
because everything it needs to resume is already on disk.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import coordinator  # noqa: E402


class FakeStore:
    def __init__(self):
        self.patches = []

    def update_run(self, run_id, patch):
        self.patches.append((run_id, patch))
        return patch


class TheStopFile(unittest.TestCase):
    def setUp(self):
        self.real_stop = coordinator.STOP_FILE
        self.real_store = coordinator.store
        coordinator.store = FakeStore()
        self.tmp = Path(__file__).resolve().parent / "_stop_under_test"
        coordinator.STOP_FILE = self.tmp

    def tearDown(self):
        coordinator.STOP_FILE = self.real_stop
        coordinator.store = self.real_store
        if self.tmp.exists():
            self.tmp.unlink()

    def test_no_file_means_the_scraper_is_on(self):
        self.assertIsNone(coordinator.stopped())

    def test_the_file_s_contents_are_the_reason(self):
        self.tmp.write_text("because the qualifier was wrong")
        self.assertEqual(coordinator.stopped(), "because the qualifier was wrong")

    def test_an_empty_file_still_stops_it(self):
        self.tmp.write_text("   ")
        self.assertEqual(coordinator.stopped(), "stopped by hand")


class AClaimedRunIsNeverAbandoned(unittest.TestCase):
    def setUp(self):
        self.real_store = coordinator.store
        self.fake = FakeStore()
        coordinator.store = self.fake

    def tearDown(self):
        coordinator.store = self.real_store

    def test_release_puts_the_run_back_on_the_queue(self):
        coordinator.release_to_queue("run-1", "scraper is off")
        self.assertEqual(self.fake.patches, [("run-1", {"status": "queued"})])

    def test_release_carries_the_counts_it_got_to(self):
        coordinator.release_to_queue("run-1", "stopped mid-run", raw_found=120, kept_count=9)
        _, patch = self.fake.patches[0]
        self.assertEqual(patch["status"], "queued")
        self.assertEqual(patch["raw_found"], 120)

    def test_a_bookkeeping_failure_never_raises(self):
        class Broken(FakeStore):
            def update_run(self, run_id, patch):
                raise RuntimeError("supabase is down")
        coordinator.store = Broken()
        coordinator.release_to_queue("run-1", "scraper is off")   # must not raise

    def test_a_local_run_with_no_id_is_a_no_op(self):
        coordinator.release_to_queue(None, "scraper is off")
        self.assertEqual(self.fake.patches, [])


if __name__ == "__main__":
    unittest.main()
