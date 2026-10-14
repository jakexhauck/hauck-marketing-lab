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

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import niche  # noqa: E402

TRADES = ("roofing", "remodeling", "siding_windows", "windows_doors",
          "general_contracting", "garage_doors", "flooring", "landscaping",
          "hvac")

# The primary category that unambiguously means each trade.
PRIMARY = {
    "roofing": "roofing contractor",
    "remodeling": "kitchen remodeler",
    "siding_windows": "siding contractor",
    "windows_doors": "window installation service",
    "general_contracting": "general contractor",
    "garage_doors": "garage door supplier",
    "flooring": "flooring contractor",
    "landscaping": "landscaper",
    "hvac": "hvac contractor",
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
                self.assertIn("sewer", n.deny)
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

    def test_the_separation_holds_when_the_name_says_another_trade(self):
        # The neutral name above drops out of every trade anyway, on the catch-all
        # niche-signal gate, so on its own it cannot show the separation is real.
        # A firm whose NAME reads like the trade being scraped can only be refused
        # by its primary category, which is where a missing primary_deny shows up.
        for tid in TRADES:
            if tid == "flooring":
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                _, flags, verdict = score(n, "Elite Roofing & Flooring", "flooring contractor")
                self.assertEqual(verdict, "drop", f"{tid} took a flooring firm: {flags}")
                self.assertTrue(
                    any(f.startswith("primary_off_niche") for f in flags),
                    f"{tid} refused it for the wrong reason: {flags}",
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
            # HVAC escapes 'plumbing' on purpose (Plumbing, Heating & Air shops), so a
            # plumber is refused there by primary category rather than by the word.
            plumber_primary = "plumber" if tid == "hvac" else PRIMARY[tid]
            for name, primary in (
                ("Rapid Response Plumbing", plumber_primary),
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


class GarageDoorsEscapesTheSharedList(unittest.TestCase):
    """The one trade the shared list was written to throw away.

    'garage door' sits in the shared deny on purpose, so no other trade picks these
    firms up. And Google files most of them as a garage door SUPPLIER, a word that
    everywhere else means a counter with a showroom. Both had to be escapable by
    this trade and by nothing else, which is what deny_remove is for.
    """

    def setUp(self):
        self.n = niche.load_niche("garage_doors")

    def test_a_real_installer_reaches_a_list(self):
        s, flags, verdict = score(self.n, "Precision Garage Door", "garage door supplier")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_the_repair_half_of_the_same_business_qualifies_too(self):
        # These firms install and repair, and Google files them under either.
        s, flags, verdict = score(self.n, "A1 Overhead Door", "garage door repair service")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_supply_yard_is_still_refused(self):
        # 'supplier' is escaped; 'supply', 'store' and 'showroom' are not.
        for name, primary in (
            ("Garage Door Supply Co", "garage door supplier"),
            ("Overhead Door Store", "garage door supplier"),
            ("Puget Door Showroom", "garage door supplier"),
        ):
            with self.subTest(business=name):
                _, flags, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop", f"{name} survived: {flags}")

    def test_the_escape_does_not_leak_into_any_other_trade(self):
        # If this ever fails, every window and roofing list starts filling up with
        # garage door companies, which is the thing the shared deny prevents.
        for tid in TRADES:
            if tid == "garage_doors":
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                self.assertIn("garage door", n.deny)
                self.assertIn("supplier", n.deny)
                _, flags, verdict = score(n, "Precision Garage Door", PRIMARY[tid])
                self.assertEqual(verdict, "drop", f"{tid} took a garage firm: {flags}")

    def test_it_still_refuses_the_trades_it_is_not(self):
        for other in ("roofing contractor", "window installation service",
                      "siding contractor", "general contractor"):
            with self.subTest(primary=other):
                _, flags, verdict = score(self.n, "Valley Home Services", other)
                self.assertEqual(verdict, "drop", f"took a {other}: {flags}")

    def test_the_shared_guards_are_all_still_in_place(self):
        for name, primary in (("Rapid Response Plumbing", "garage door supplier"),
                              ("Shield Pest Control", "pest control service")):
            with self.subTest(business=name):
                _, _, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop")


class FlooringEscapesTheStoreDeny(unittest.TestCase):
    """The second trade Google files under a retail word.

    'store' sits in the shared deny because everywhere else it means a counter with
    stock on it. Flooring is the trade where it is also Google's ordinary word for a
    firm that installs: a large share of real installers are filed as a flooring,
    carpet or tile STORE. This trade escapes that one term and nothing else, so shop,
    showroom, supply, supplier, wholesale and retail still throw a retailer away.
    """

    def setUp(self):
        self.n = niche.load_niche("flooring")

    def test_an_installer_google_calls_a_store_reaches_a_list(self):
        s, flags, verdict = score(self.n, "Summit Hardwood Flooring", "flooring store")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_contractor_filed_the_ordinary_way_qualifies_too(self):
        s, flags, verdict = score(self.n, "Cascade Floor Co", "flooring contractor")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_wood_floor_installer_survives_the_installation_service_rule(self):
        # 'installation service' is a broad category the shared list denies unless it
        # carries a narrower form, and the shared list only names windows, doors,
        # siding and insulation. Without flooring's own exception every hardwood
        # installer Google files this way is thrown away before it is ever scored.
        s, flags, verdict = score(self.n, "Northwest Hardwood", "wood floor installation service")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_refinisher_qualifies(self):
        s, flags, verdict = score(self.n, "Old Growth Floor Refinishing", "floor refinishing service")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_carpet_cleaner_is_still_refused(self):
        # The recurring-service look-alike this trade would otherwise swallow whole.
        _, flags, verdict = score(self.n, "Zerorez Carpet Cleaning", "carpet cleaning service")
        self.assertEqual(verdict, "drop", f"{flags}")

    def test_a_showroom_or_supply_yard_is_still_refused(self):
        # 'store' is escaped; shop, showroom and supply are not.
        for name, primary in (
            ("Bedrosians Tile Showroom", "tile store"),
            ("Carpet Supply Warehouse", "flooring store"),
            ("Foothill Flooring Outlet Shop", "flooring store"),
        ):
            with self.subTest(business=name):
                _, flags, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop", f"{name} survived: {flags}")

    def test_the_escape_does_not_leak_into_any_other_trade(self):
        # If this ever fails, every roofing and window list starts filling up with
        # carpet stores, which is the thing the shared deny prevents.
        for tid in TRADES:
            if tid == "flooring":
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                self.assertIn("store", n.deny)
                _, flags, verdict = score(n, "Summit Hardwood Flooring", "flooring store")
                self.assertEqual(verdict, "drop", f"{tid} took a flooring firm: {flags}")

    def test_it_still_refuses_the_trades_it_is_not(self):
        for other in ("roofing contractor", "window installation service",
                      "siding contractor", "general contractor"):
            with self.subTest(primary=other):
                _, flags, verdict = score(self.n, "Valley Home Services", other)
                self.assertEqual(verdict, "drop", f"took a {other}: {flags}")


class LandscapingEscapesTheSharedList(unittest.TestCase):
    """The trade the shared list was written to keep out.

    landscap, lawn, irrigation and sprinkler are denied on every name and category,
    and 'landscaper' as a primary, so no OTHER trade collects these firms. Real
    landscapers also carry lawn care and snow removal as secondary categories and in
    their names, so those move from a hard drop to a PRIMARY-only refusal here: a
    crew Google files first as lawn care is still a recurring-service business.
    """

    def setUp(self):
        self.n = niche.load_niche("landscaping")

    def test_a_landscaper_qualifies(self):
        s, flags, verdict = score(self.n, "Summit Landscaping", "landscaper")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_designer_who_also_mows_and_plows_qualifies(self):
        s, flags, verdict = score(
            self.n, "Green Acres Lawn Care & Landscaping", "landscape designer",
            ("lawn care service", "snow removal service", "lawn sprinkler system contractor"),
        )
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_mowing_crew_is_still_refused(self):
        for name, primary in (
            ("Green Acres Lawn Care", "lawn care service"),
            ("Frontier Snow & Ice", "snow removal service"),
            ("Joe's Lawn Mowing", "landscaper"),
        ):
            with self.subTest(business=name):
                _, flags, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop", f"{name} survived: {flags}")

    def test_supply_yards_nurseries_and_tree_crews_are_still_refused(self):
        for name, primary in (
            ("Rocky Mountain Landscape Supply", "landscaping supply store"),
            ("Valley Garden Center", "garden center"),
            ("Evergreen Nursery", "plant nursery"),
            ("Tall Pines Tree Service", "tree service"),
        ):
            with self.subTest(business=name):
                _, flags, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop", f"{name} survived: {flags}")

    def test_the_escape_does_not_leak_into_any_other_trade(self):
        base = json.loads((niche.NICHES_DIR / "_shared.json").read_text(encoding="utf-8"))
        for tid in TRADES:
            if tid == "landscaping":
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                self.assertIn("landscap", n.deny)
                self.assertIn("landscaper", n.primary_deny)
                for term in ("lawn care", "snow removal"):
                    self.assertIn(term, n.recurring_deny, f"{tid} lost {term!r}")
                _, flags, verdict = score(n, "Summit Roofing & Landscaping", "landscaper")
                self.assertEqual(verdict, "drop", f"{tid} took a landscaper: {flags}")

    def test_it_still_refuses_the_trades_it_is_not(self):
        for other in ("roofing contractor", "general contractor", "flooring contractor",
                      "siding contractor", "plumber"):
            with self.subTest(primary=other):
                _, flags, verdict = score(self.n, "Summit Landscaping", other)
                self.assertEqual(verdict, "drop", f"took a {other}: {flags}")


class HvacKeepsTheShopsThatAlsoPlumb(unittest.TestCase):
    """Back after being dropped on 2026-08-20.

    A large share of residential HVAC firms are "Plumbing, Heating & Air" shops that
    carry Plumber and Air duct cleaning service as SECONDARY categories. The shared
    lists scan every category, so without the escapes they would all be thrown away.
    Both stay refused as a PRIMARY.
    """

    def setUp(self):
        self.n = niche.load_niche("hvac")

    def test_an_hvac_contractor_qualifies(self):
        s, flags, verdict = score(self.n, "Apex Heating & Air", "hvac contractor")
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_a_plumbing_heating_and_air_shop_qualifies(self):
        s, flags, verdict = score(
            self.n, "Smith Plumbing, Heating & Air", "hvac contractor",
            ("plumber", "air duct cleaning service", "furnace repair service"),
        )
        self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_the_repair_and_installation_forms_survive_the_broad_rules(self):
        for primary in ("air conditioning repair service", "furnace repair service",
                        "hvac repair service", "hvac installation service"):
            with self.subTest(primary=primary):
                s, flags, verdict = score(self.n, "Cascade Comfort", primary)
                self.assertEqual(verdict, "pass", f"{s} {flags}")

    def test_plumbers_duct_cleaners_and_suppliers_are_still_refused(self):
        for name, primary in (
            ("Smith Plumbing & Heating", "plumber"),
            ("Fresh Air Duct Cleaning", "air duct cleaning service"),
            ("Valley Heating Rooter & Drain", "hvac contractor"),
            ("Metro Heating Supply", "heating equipment supplier"),
            ("Quick Appliance Repair", "appliance repair service"),
        ):
            with self.subTest(business=name):
                _, flags, verdict = score(self.n, name, primary)
                self.assertEqual(verdict, "drop", f"{name} survived: {flags}")

    def test_the_escape_does_not_leak_into_any_other_trade(self):
        for tid in TRADES:
            if tid == "hvac":
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                self.assertIn("plumbing", n.deny)
                self.assertIn("duct cleaning", n.recurring_deny)
                _, flags, verdict = score(n, "Apex Heating & Air", "hvac contractor")
                self.assertEqual(verdict, "drop", f"{tid} took an hvac firm: {flags}")

    def test_it_still_refuses_the_trades_it_is_not(self):
        for other in ("roofing contractor", "general contractor", "flooring contractor",
                      "landscaper", "siding contractor"):
            with self.subTest(primary=other):
                _, flags, verdict = score(self.n, "Apex Heating & Air", other)
                self.assertEqual(verdict, "drop", f"took a {other}: {flags}")


class DenyRemoveIsNarrow(unittest.TestCase):
    def test_a_trade_that_does_not_ask_keeps_every_inherited_term(self):
        base = json.loads((niche.NICHES_DIR / "_shared.json").read_text(encoding="utf-8"))
        for tid in TRADES:
            if tid in ("garage_doors", "flooring", "landscaping", "hvac"):
                continue
            n = niche.load_niche(tid)
            with self.subTest(trade=tid):
                missing = [t for t in base["deny"] if t not in n.deny]
                self.assertEqual(missing, [], f"{tid} lost inherited deny terms")

    def test_removing_a_term_that_is_not_inherited_is_not_an_error(self):
        spec = {"id": "t", "deny": ["alpha"], "extends": "_shared",
                "deny_remove": ["not in any list"]}
        n = niche.niche_from_spec(niche._resolve_spec(spec))
        self.assertIn("alpha", n.deny)


    def test_every_list_remove_key_is_consumed_by_the_resolver(self):
        spec = {"id": "t", "extends": "_shared", "deny_remove": ["store"],
                "recurring_deny_remove": ["lawn care"], "primary_deny_remove": ["plumber"]}
        resolved = niche._resolve_spec(spec)
        self.assertNotIn("store", resolved["deny"])
        self.assertNotIn("lawn care", resolved["recurring_deny"])
        self.assertNotIn("plumber", resolved["primary_deny"])
        for key in ("deny_remove", "recurring_deny_remove", "primary_deny_remove"):
            self.assertNotIn(key, resolved)

if __name__ == "__main__":
    unittest.main()
