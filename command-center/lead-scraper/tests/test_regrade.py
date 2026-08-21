"""Regrade rules, offline. No network: plan() is pure given a list of rows."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import regrade  # noqa: E402


def row(**kw):
    base = {"id": "00000000-0000-0000-0000-000000000001", "phone_e164": "+12533847029",
            "business_name": "Gerasim Windows & Doors", "primary_type": "window installation service",
            "categories": ["window installation service"], "review_count": 40, "rating": 4.8,
            "website": "https://example.com", "icp_score": 50, "send_status": "pending",
            "niche_id": "windows_doors"}
    return {**base, **kw}


class HistoryIsNeverRewritten(unittest.TestCase):
    def test_a_queued_row_is_never_disqualified(self):
        junk = row(business_name="Premier Storage", primary_type="self-storage facility",
                   categories=["self-storage facility"], send_status="cold_call_20260818_queued")
        _, dq, untouched = regrade.plan([junk])
        self.assertEqual(dq, [])
        self.assertEqual(len(untouched), 1)

    def test_a_pending_row_that_now_fails_is_disqualified(self):
        junk = row(business_name="Premier Storage", primary_type="self-storage facility",
                   categories=["self-storage facility"])
        _, dq, _ = regrade.plan([junk])
        self.assertEqual(len(dq), 1)

    def test_a_disqualified_row_is_stamped_not_deleted(self):
        # The whole contract: it leaves the export pool, it does not leave the table.
        self.assertTrue(regrade.disqualified_label().startswith("disqualified_"))


class ARetiredTradeIsLeftAlone(unittest.TestCase):
    def test_a_niche_with_no_file_is_reported_not_guessed_at(self):
        orphan = row(niche_id="hvac", business_name="Reds Heating and Cooling",
                     primary_type="hvac contractor", categories=["hvac contractor"])
        rescored, dq, untouched = regrade.plan([orphan])
        self.assertEqual((rescored, dq), ([], []))
        self.assertEqual(len(untouched), 1)

    def test_a_row_with_no_niche_at_all_is_left_alone(self):
        rescored, dq, untouched = regrade.plan([row(niche_id=None)])
        self.assertEqual((rescored, dq), ([], []))
        self.assertEqual(len(untouched), 1)


class TheCurrentRubricIsApplied(unittest.TestCase):
    def test_a_real_operator_is_rescored_not_dropped(self):
        rescored, dq, _ = regrade.plan([row()])
        self.assertEqual(dq, [])
        self.assertEqual(len(rescored), 1)
        _, score, _, verdict, _ = rescored[0]
        self.assertEqual(verdict, "pass")
        self.assertGreater(score, 50)

    def test_a_wrong_trade_name_match_is_no_longer_a_pass(self):
        tint = row(business_name="Faso Window Tinting", primary_type="window tinting service",
                   categories=["window tinting service"])
        rescored, _, _ = regrade.plan([tint])
        self.assertEqual(len(rescored), 1)
        _, _, flags, verdict, _ = rescored[0]
        self.assertEqual(verdict, "low", f"still exporting: {flags}")


if __name__ == "__main__":
    unittest.main()


class RetiringATrade(unittest.TestCase):
    """Dropping a trade leaves its leads behind. Retiring takes them out of
    circulation the same way a regrade does: stamped, never deleted, pending only."""

    def _rows(self):
        return [row(id="a", niche_id="hvac", send_status="pending"),
                row(id="b", niche_id="hvac", send_status="cold_call_20260818_queued"),
                row(id="c", niche_id="windows_doors", send_status="pending")]

    def test_a_dry_run_writes_nothing(self):
        self.assertEqual(regrade.retire("hvac", self._rows(), dry_run=True), 0)

    def test_only_the_named_trade_s_pending_rows_are_counted(self):
        seen = {}

        def fake_patch(ids, body):
            seen["ids"], seen["body"] = ids, body

        real_patch, real_undo = regrade.patch, regrade.write_undo
        regrade.patch = fake_patch
        regrade.write_undo = lambda r, d, p=None: p
        try:
            n = regrade.retire("hvac", self._rows())
        finally:
            regrade.patch, regrade.write_undo = real_patch, real_undo
        self.assertEqual(n, 1)
        self.assertEqual(seen["ids"], ["a"])          # not the queued one, not windows
        self.assertTrue(seen["body"]["send_status"].startswith("retired_hvac_"))
