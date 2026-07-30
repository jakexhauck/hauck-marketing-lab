"""The queue is what makes a run resumable and what stops a run scraping half a city.
These assert the two properties that matter: the merge is idempotent, and a size cap
never truncates a location's keyword set part way through.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import build_queue  # noqa: E402
import niche  # noqa: E402

KWS = ("roofing contractor", "hvac contractor", "home remodeling")


class MetroGrid(unittest.TestCase):
    def test_every_state_and_dc_is_covered(self):
        states = {m["state"] for m in build_queue.load_metros()}
        expected = set(
            "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN "
            "MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA "
            "WV WI WY".split()
        )
        self.assertEqual(expected - states, set(), "metros.json is missing states")

    def test_every_metro_has_an_anchor_and_suburbs(self):
        for m in build_queue.load_metros():
            with self.subTest(metro=m["metro"]):
                self.assertTrue(m["query_anchor"].strip())
                self.assertTrue(m["suburbs"], f"{m['metro']} has no suburb ring")


class JobRows(unittest.TestCase):
    def test_a_state_expands_to_its_metros_and_suburbs(self):
        rows = build_queue.build_rows_for_job(states=["TX"], size="deep", keywords=KWS)
        self.assertTrue(rows)
        self.assertEqual({r["state"] for r in rows}, {"TX"})
        self.assertEqual({r["pass"] for r in rows}, {1, 2}, "deep should run both passes")
        self.assertIn("Southlake TX", {r["location"] for r in rows})

    def test_quick_runs_one_location_and_pass_one_only(self):
        rows = build_queue.build_rows_for_job(states=["TX"], size="quick", keywords=KWS)
        self.assertEqual(len({r["location"] for r in rows}), 1)
        self.assertEqual({r["pass"] for r in rows}, {1})

    def test_a_size_cap_never_half_scrapes_a_location(self):
        # Every location that survives the cap must carry the full keyword set,
        # otherwise a city is silently half-done and looks complete.
        for size in ("quick", "standard", "deep"):
            rows = build_queue.build_rows_for_job(states=["CA", "TX"], size=size, keywords=KWS)
            by_location = {}
            for r in rows:
                by_location.setdefault(r["location"], set()).add(r["keyword"])
            for loc, kws in by_location.items():
                with self.subTest(size=size, location=loc):
                    self.assertEqual(kws, set(KWS))

    def test_hand_picked_cities_are_taken_literally(self):
        rows = build_queue.build_rows_for_job(
            cities=[{"city": "Boise", "state": "ID"}, {"city": "Plano", "state": "TX"}],
            size="standard", keywords=KWS,
        )
        self.assertEqual({r["location"] for r in rows}, {"Boise ID", "Plano TX"})
        self.assertEqual({r["pass"] for r in rows}, {1}, "named cities are never inferred on")

    def test_states_and_cities_can_be_combined(self):
        rows = build_queue.build_rows_for_job(
            states=["VT"], cities=[{"city": "Plano", "state": "TX"}],
            size="deep", keywords=KWS,
        )
        self.assertIn("Plano TX", {r["location"] for r in rows})
        self.assertIn("VT", {r["state"] for r in rows})

    def test_ids_are_stable_so_a_rerun_does_not_duplicate(self):
        a = build_queue.build_rows_for_job(states=["ID"], size="standard", keywords=KWS)
        b = build_queue.build_rows_for_job(states=["ID"], size="standard", keywords=KWS)
        self.assertEqual([r["id"] for r in a], [r["id"] for r in b])

    def test_the_active_niche_supplies_the_keywords_by_default(self):
        rows = build_queue.build_rows_for_job(states=["ID"], size="quick")
        self.assertEqual({r["keyword"] for r in rows}, set(niche.ACTIVE.keywords))


class QueueMerge(unittest.TestCase):
    def test_merge_is_idempotent_and_keeps_done_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "queue.jsonl"
            rows = build_queue.build_rows_for_job(states=["ID"], size="quick", keywords=KWS)

            total, added = build_queue.merge_into_queue(rows, path)
            self.assertEqual(added, len(rows))

            # Work one row, then merge the identical set again.
            on_disk = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
            on_disk[0]["status"] = "done"
            path.write_text("\n".join(json.dumps(r) for r in on_disk) + "\n")

            total2, added2 = build_queue.merge_into_queue(rows, path)
            self.assertEqual(added2, 0, "a re-run should add nothing")
            self.assertEqual(total2, total)

            after = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
            done = [r for r in after if r["status"] == "done"]
            self.assertEqual(len(done), 1, "the merge trampled a completed row")


if __name__ == "__main__":
    unittest.main()
