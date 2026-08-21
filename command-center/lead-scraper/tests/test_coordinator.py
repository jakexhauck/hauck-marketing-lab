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

    def test_a_byte_order_mark_is_not_part_of_the_reason(self):
        # Notepad and PowerShell both write one, and this file gets made by hand.
        self.tmp.write_bytes("google is angry".encode("utf-8-sig"))
        self.assertEqual(coordinator.stopped(), "google is angry")

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


class TheRunSummarySaysWhatCanBeSent(unittest.TestCase):
    """pass_rate is kept / raw: how much of what Google returned was worth STORING.

    Nobody wants that number. A stored lead is not a lead you can ring: on the
    live table two of every three qualified businesses are landlines, so a run
    that reported its pass rate alone overstated what it had found by about 3x.
    """

    def prog(self, raw=0, kept=0, passed=0, sendable=0):
        p = coordinator.Progress("run-1", 10)
        p.raw, p.kept, p.passed, p.sendable = raw, kept, passed, sendable
        return p

    def test_the_patch_carries_both_counts(self):
        patch = self.prog(raw=100, kept=40, passed=12, sendable=4).as_patch()
        self.assertEqual(patch["kept_count"], 40)
        self.assertEqual(patch["passed_count"], 12)
        self.assertEqual(patch["sendable_count"], 4)

    def test_the_send_rate_is_sendable_over_raw_not_kept_over_raw(self):
        p = self.prog(raw=100, kept=40, passed=12, sendable=4)
        self.assertEqual(p.as_patch()["pass_rate"], 0.4)
        self.assertEqual(coordinator.send_rate(p), 0.04)

    def test_an_empty_run_reports_zero_rather_than_dividing_by_zero(self):
        p = self.prog()
        self.assertEqual(p.as_patch()["pass_rate"], 0.0)
        self.assertEqual(coordinator.send_rate(p), 0.0)


class AResumedRunKeepsWhatItAlreadyFound(unittest.TestCase):
    """Every counter restarted at 0 on a resume, and the first push wrote those
    zeroes over the row. Run d19dc69b sat at 40 of 100 queries done with raw_found
    0: the work was on disk, the tally was not. A run that forgets what it found
    cannot report what can be rung, which is the whole point of the summary."""

    def rows(self, done, pending):
        return ([{"status": "done"}] * done) + ([{"status": "pending"}] * pending)

    def test_a_fresh_run_starts_at_nothing(self):
        p = coordinator.Progress.resumed("r1", self.rows(0, 100), None)
        self.assertEqual((p.done, p.raw, p.kept, p.sendable), (0, 0, 0, 0))
        self.assertEqual(p.total, 100)

    def test_the_queue_on_disk_is_what_says_how_many_are_done(self):
        p = coordinator.Progress.resumed("r1", self.rows(40, 60), None)
        self.assertEqual(p.done, 40)
        self.assertEqual(p.total, 100)

    def test_the_stored_tallies_are_carried_forward_not_overwritten(self):
        prior = {"raw_found": 3124, "kept_count": 194, "passed_count": 41,
                 "sendable_count": 15, "new_count": 120, "in_crm_count": 9,
                 "excluded_count": 2930}
        p = coordinator.Progress.resumed("r1", self.rows(40, 60), prior)
        self.assertEqual(p.raw, 3124)
        self.assertEqual(p.kept, 194)
        self.assertEqual(p.passed, 41)
        self.assertEqual(p.sendable, 15)
        self.assertEqual(p.new, 120)
        self.assertEqual(p.in_crm, 9)
        self.assertEqual(p.excluded, 2930)

    def test_a_null_count_on_an_older_run_reads_as_zero(self):
        p = coordinator.Progress.resumed("r1", self.rows(1, 1), {"raw_found": None})
        self.assertEqual(p.raw, 0)

    def test_a_local_run_with_no_row_to_read_still_counts_its_queue(self):
        p = coordinator.Progress.resumed(None, self.rows(3, 7), None)
        self.assertEqual((p.done, p.total), (3, 10))


class TheWatcherOutlivesTheOffSwitch(unittest.TestCase):
    """The watcher is a service now: it starts at logon so that pressing Go in the
    app is the whole job. data/.stop used to make it RETURN, which a service would
    answer by restarting it, forever. Idling is the honest behaviour: the switch
    stops scraping, which is what it is for, and stopping is not the same as dying.
    """

    def setUp(self):
        self.real_stop = coordinator.STOP_FILE
        self.real_store = coordinator.store
        self.real_sleep = coordinator.time.sleep
        self.store = FakeStore()
        self.store.claims = 0
        self.slept = []
        coordinator.store = self.store
        coordinator.time.sleep = lambda s: self.slept.append(s)
        self.tmp = Path(__file__).resolve().parent / "_watch_stop_under_test"
        coordinator.STOP_FILE = self.tmp

        def claim_next_run():
            self.store.claims += 1
            return None
        self.store.claim_next_run = claim_next_run

    def tearDown(self):
        coordinator.STOP_FILE = self.real_stop
        coordinator.store = self.real_store
        coordinator.time.sleep = self.real_sleep
        if self.tmp.exists():
            self.tmp.unlink()

    def test_the_off_switch_stops_it_scraping_without_killing_it(self):
        self.tmp.write_text("hands off")
        coordinator.watch(interval=0, polls=3)
        self.assertEqual(self.store.claims, 0, "asked the database for work while off")
        self.assertEqual(len(self.slept), 3, "did not keep polling")

    def test_it_polls_for_work_when_the_switch_is_off_the_file(self):
        coordinator.watch(interval=0, polls=2)
        self.assertEqual(self.store.claims, 2)

    def test_the_switch_being_dropped_in_mid_watch_is_noticed(self):
        # Checked every poll, not once at the top: the file is how a run already
        # going gets stopped, and a service never gets restarted to re-read it.
        polls = {"n": 0}

        def claim_next_run():
            polls["n"] += 1
            self.tmp.write_text("stop now")
            return None
        self.store.claim_next_run = claim_next_run
        coordinator.watch(interval=0, polls=4)
        self.assertEqual(polls["n"], 1, "kept scraping after the switch was thrown")


if __name__ == "__main__":
    unittest.main()