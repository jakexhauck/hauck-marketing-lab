"""One niche per trade, and the line between them.

Two properties matter, and they pull against each other:

  1. A trade must reject its siblings. Scraping Roofing should not fill the table
     with HVAC companies, or the campaign speaks to the wrong people.
  2. A trade must NOT reject an operator who happens to do more than one thing.
     "Rob's Roofing & Remodeling" is a roofer. Denying "remodeling" on the business
     NAME would throw him away, and he is exactly who we want.

The separation is therefore done on PRIMARY CATEGORY only, using the SOP's own
primary_deny. These tests are what stops someone "tidying up" by moving a sibling
trade into the deny list, which would look sensible and quietly cost the best leads.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import niche  # noqa: E402

TRADES = ("roofing", "hvac", "remodeling", "siding_windows", "general_contracting")

# The primary category that unambiguously means each trade.
PRIMARY = {
    "roofing": "roofing contractor",
    "hvac": "hvac contractor",
    "remodeling": "kitchen remodeler",
    "siding_windows": "siding contractor",
    "general_contracting": "general contractor",
}

GENEROUS = {"website": "https://example.com", "rating": 4.8, "review_count": 40,
            "phone_type": "other"}


def score(n, name, primary, cats=()):
    return niche.classify(name, primary, cats, niche=n, **GENEROUS)


class EachTradeLoads(unittest.TestCase):
    def test_every_trade_resolves_its_shared_base(self):
        for tid in TRADES:
            with self.subTest(trade=tid):
                n = niche.load_niche(tid)
                # Inherited from _shared rather than restated in each file.
                self.assertIn("plumbing", n.deny)
                self.assertIn("restaurant", n.category_only)
                self.assertIn("pool", n.whole_word)
                self.assertTrue(n.recurring_deny)
                # Its own.
                self.assertTrue(n.keywords)
                self.assertTrue(n.allow_core)
                self.assertEqual(n.export_threshold, 50)

    def test_the_shared_base_is_never_offered_as_a_niche(self):
        ids = {x["id"] for x in niche.available_niches()}
        self.assertNotIn("_shared", ids)
        for tid in TRADES:
            self.assertIn(tid, ids)


class TradesRejectTheirSiblings(unittest.TestCase):
    def test_a_trade_keeps_its_own_and_drops_the_others(self):
        for tid in TRADES:
            n = niche.load_niche(tid)
            for other, primary in PRIMARY.items():
                name = "Valley Home Services"  # deliberately neutral
                _, flags, verdict = score(n, name, primary)
                with self.subTest(niche=tid, business_primary=other):
                    if other == tid:
                        self.assertNotEqual(
                            verdict, "drop",
                            f"{tid} rejected its own primary {primary!r}: {flags}",
                        )
                    else:
                        self.assertEqual(
                            verdict, "drop",
                            f"{tid} accepted a {other} business ({primary!r}): {flags}",
                        )

    def test_the_rejection_is_by_primary_category_not_by_name(self):
        roofing = niche.load_niche("roofing")
        _, flags, verdict = score(roofing, "Valley Home Services", "hvac contractor")
        self.assertEqual(verdict, "drop")
        self.assertTrue(
            any(f.startswith("primary_off_niche") for f in flags),
            f"expected a primary-category rejection, got {flags}",
        )


class MultiTradeOperatorsSurvive(unittest.TestCase):
    """The reason siblings are never denied on the name."""

    def test_a_roofer_who_also_remodels_is_still_a_roofer(self):
        n = niche.load_niche("roofing")
        s, flags, verdict = score(n, "Rob's Roofing & Remodeling", "roofing contractor")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_remodeler_who_also_roofs_is_still_a_remodeler(self):
        n = niche.load_niche("remodeling")
        s, flags, verdict = score(n, "Boyd Remodeling and Roofing", "remodeler")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_an_hvac_firm_named_for_construction_survives(self):
        n = niche.load_niche("hvac")
        s, flags, verdict = score(n, "Summit Mechanical & Construction", "hvac contractor")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_secondary_sibling_category_does_not_disqualify(self):
        # Only the PRIMARY decides the trade. A roofer who also lists remodeling
        # as a secondary category is still a roofer.
        n = niche.load_niche("roofing")
        _, flags, verdict = score(n, "Flux Roofing", "roofing contractor", ("remodeler",))
        self.assertNotEqual(verdict, "drop", f"{flags}")


class TradesKeepTheSharedGuards(unittest.TestCase):
    """Splitting into trades must not reopen anything the shared list closes."""

    def test_plumbers_and_supply_yards_are_still_rejected_everywhere(self):
        for tid in TRADES:
            n = niche.load_niche(tid)
            for name, primary in (
                ("Rapid Response Plumbing", PRIMARY[tid]),
                ("Northside Lumber Supply", "lumber store"),
                ("Shield Pest Control", "pest control service"),
            ):
                with self.subTest(trade=tid, business=name):
                    _, flags, verdict = score(n, name, primary)
                    self.assertEqual(verdict, "drop", f"{name} survived {tid}: {flags}")

    def test_the_floor_still_holds_for_every_trade(self):
        for tid in TRADES:
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                s, flags, _ = niche.classify(
                    "Generic Co", PRIMARY[tid], (), review_count=None, rating=None,
                    website=None, phone_type="other", niche=n,
                )
                self.assertLess(s, n.export_threshold,
                                f"{tid}: a bare category match reached {s} {flags}")

    def test_franchise_scale_and_toll_free_still_drop_everywhere(self):
        for tid in TRADES:
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                _, _, big = score(n, "Nationwide Co", PRIMARY[tid])
                self.assertNotEqual(big, "drop")  # sanity: the control passes
                _, _, v = niche.classify("Nationwide Co", PRIMARY[tid], (),
                                         review_count=450, rating=4.8,
                                         website="https://x.com", phone_type="other", niche=n)
                self.assertEqual(v, "drop")
                _, _, tf = niche.classify("Local Co", PRIMARY[tid], (), review_count=20,
                                          rating=4.8, website="https://x.com",
                                          phone_type="toll_free", niche=n)
                self.assertEqual(tf, "drop")


if __name__ == "__main__":
    unittest.main()
