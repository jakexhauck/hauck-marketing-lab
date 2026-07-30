"""The SOP's regression test, and the reason the qualifier stays honest.

Take the look-alikes we never want, give each one the MAXIMUM favourable soft
signals (a live website, a 5.0 rating, a healthy review count, a flattering name),
and assert every single one still fails to export. Then assert a handful of genuine
ideal customers do pass.

This is what stops a future word-list edit from quietly re-opening the junk gate.
Stdlib only, so it runs on the Mac and the PC with no extra install:

    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import niche  # noqa: E402

# The most generous soft signals a junk listing could ever carry.
GENEROUS = {"website": "https://example.com", "rating": 5.0, "review_count": 40}


def score_of(name, primary, cats=(), **kw):
    args = {**GENEROUS, "phone_type": "other", **kw}
    return niche.classify(name, primary, cats, **args)


# Every one of these must fail to export, despite the generous signals above.
LOOK_ALIKES = [
    # Recurring-service look-alikes: they share our categories, they don't buy projects.
    ("Premier Air Duct Cleaning", "air duct cleaning service", ()),
    ("Clear View Gutter Cleaning", "gutter cleaning service", ()),
    ("Ashford Chimney Sweep", "chimney sweep", ()),
    ("Blast Pro Pressure Washing", "pressure washing service", ()),
    ("Shield Pest Control", "pest control service", ()),
    # Unrelated trades.
    ("Rapid Response Plumbing", "plumber", ()),
    ("Voltage Electric Company", "electrician", ()),
    ("Green Acres Landscaping", "landscaper", ()),
    ("Solid Ground Concrete", "concrete contractor", ()),
    ("Ironclad Fence Company", "fence contractor", ()),
    ("Blue Water Pool Builders", "swimming pool contractor", ()),
    ("Sunrise Solar Solutions", "solar energy contracting service", ()),
    ("Overhead Garage Door Co", "garage door supplier", ()),
    ("Fix It Appliance Repair", "appliance repair service", ()),
    ("Timber Tree Service", "tree service", ()),
    # Retail and supply.
    ("Metro Home Improvement Store", "home improvement store", ()),
    ("Northside Lumber Supply", "lumber store", ()),
    # Adjacent-but-not-buyers.
    ("Keystone Real Estate Group", "real estate agency", ()),
    ("Anchor Property Management", "property management company", ()),
    ("Studio Nine Interior Design", "interior designer", ()),
    ("Certified Home Inspection", "home inspector", ()),
    ("Fairview Structural Engineering", "structural engineer", ()),
    # A venue.
    ("The Rusty Nail", "bar & grill", ()),
]

# The exact hole the SOP was rebuilt to close: a deny term sitting in the NAME while
# the category reads like a perfect match. Checking the category alone lets these in.
DENY_ON_NAME_ONLY = [
    ("Almco Roofing & Plumbing", "roofing contractor", ()),
    ("Evergreen Roofing & Landscaping", "roofing contractor", ()),
    ("Total Home HVAC & Pest Control", "hvac contractor", ()),
]

# A clean primary category, with the disqualifier hiding in a SECONDARY category.
DENY_ON_SECONDARY_CATEGORY = [
    ("Summit Contracting", "general contractor", ("apartment building",)),
    ("Northgate Builders", "construction company", ("swimming pool contractor",)),
]

# Real operators. These must export.
IDEAL = [
    ("Summit Roofing & Restoration", "roofing contractor", (), 45, 4.8),
    ("Apex Heating & Air", "hvac contractor", (), 30, 4.6),
    ("Heritage Kitchen & Bath Remodeling", "kitchen remodeler", (), 20, 4.9),
    ("Cornerstone Home Renovation", "remodeler", (), 12, 4.5),
    ("Blue Ridge Exteriors & Siding", "siding contractor", (), 60, 4.4),
]

# Whole-word guards: an ambiguous deny term buried inside a longer, innocent word.
WHOLE_WORD_SAFE = [
    ("Whirlpool Roofing Co", "roofing contractor"),      # pool
    ("Storey Brothers Construction", "general contractor"),  # store
    ("Cardinal Roofing", "roofing contractor"),          # car
    ("Bankston Heating & Air", "hvac contractor"),       # bank
    ("Sparta Home Remodeling", "remodeler"),             # spa
    ("Lawndale Roofing", "roofing contractor"),          # lawn
    ("Solarium Home Additions", "general contractor"),   # solar
]

# Venue words are category-only: they are fine in a business NAME.
VENUE_WORD_IN_NAME_OK = [
    ("Coffee County Roofing", "roofing contractor"),
    ("Church Street Contracting", "general contractor"),
    ("Schoolhouse Remodeling", "remodeler"),
]


class LookAlikesNeverExport(unittest.TestCase):
    def test_look_alikes_all_fail_despite_generous_signals(self):
        for name, primary, cats in LOOK_ALIKES:
            with self.subTest(business=name):
                score, flags, verdict = score_of(name, primary, cats)
                self.assertNotEqual(
                    verdict, "pass",
                    f"{name} ({primary}) exported with score {score}: {flags}",
                )

    def test_deny_terms_are_caught_in_the_name_not_just_the_category(self):
        for name, primary, cats in DENY_ON_NAME_ONLY:
            with self.subTest(business=name):
                score, flags, verdict = score_of(name, primary, cats)
                self.assertEqual(
                    verdict, "drop",
                    f"{name} survived on a clean category: {score} {flags}",
                )
                self.assertTrue(
                    any(f.endswith("@name") for f in flags),
                    f"{name} was dropped, but not by the name scan: {flags}",
                )

    def test_deny_terms_are_caught_in_every_category_not_just_the_primary(self):
        for name, primary, cats in DENY_ON_SECONDARY_CATEGORY:
            with self.subTest(business=name):
                score, flags, verdict = score_of(name, primary, cats)
                self.assertEqual(
                    verdict, "drop",
                    f"{name} survived a denied secondary category: {score} {flags}",
                )

    def test_franchise_scale_operators_are_dropped(self):
        score, flags, verdict = score_of(
            "Nationwide Roofing Group", "roofing contractor", (), review_count=450
        )
        self.assertEqual(verdict, "drop")
        self.assertIn(f"reviews_gt_{niche.ACTIVE.max_reviews}", flags)

    def test_toll_free_numbers_are_dropped(self):
        score, flags, verdict = score_of(
            "Apex Roofing", "roofing contractor", (), phone_type="toll_free"
        )
        self.assertEqual(verdict, "drop")
        self.assertIn("toll_free", flags)


class IdealCustomersExport(unittest.TestCase):
    def test_ideal_customers_pass(self):
        for name, primary, cats, reviews, rating in IDEAL:
            with self.subTest(business=name):
                score, flags, verdict = niche.classify(
                    name, primary, cats,
                    review_count=reviews, rating=rating,
                    website="https://example.com", phone_type="other",
                )
                self.assertEqual(
                    verdict, "pass",
                    f"{name} failed to export with {score}: {flags}",
                )


class Guards(unittest.TestCase):
    def test_ambiguous_short_words_match_whole_words_only(self):
        for name, primary in WHOLE_WORD_SAFE:
            with self.subTest(business=name):
                score, flags, verdict = score_of(name, primary)
                self.assertNotEqual(
                    verdict, "drop",
                    f"{name} was false-tripped by a substring: {flags}",
                )

    def test_venue_words_deny_on_category_but_not_on_a_name(self):
        for name, primary in VENUE_WORD_IN_NAME_OK:
            with self.subTest(business=name):
                score, flags, verdict = score_of(name, primary)
                self.assertNotEqual(
                    verdict, "drop",
                    f"{name} was dropped for a venue word in its NAME: {flags}",
                )

    def test_broad_category_denied_unless_it_carries_the_narrow_form(self):
        # "Installation service" alone is anyone's; the window form is ours.
        _, _, broad = score_of("Ace Installers", "installation service")
        self.assertEqual(broad, "drop")
        _, _, narrow = score_of("Ace Window Co", "window installation service")
        self.assertNotEqual(narrow, "drop")


class TheFloorIsProvenByConstruction(unittest.TestCase):
    """The whole idea: a bare category match, with nothing else, cannot export."""

    def test_bare_category_match_lands_below_the_threshold(self):
        score, flags, verdict = niche.classify(
            "Generic Co", "roofing contractor", (),
            review_count=None, rating=None, website=None, phone_type="other",
        )
        self.assertLess(score, niche.ACTIVE.export_threshold, f"{score} {flags}")
        self.assertEqual(verdict, "low")

    def test_one_real_signal_is_enough(self):
        score, _, verdict = niche.classify(
            "Generic Co", "roofing contractor", (),
            review_count=None, rating=None,
            website="https://example.com", phone_type="other",
        )
        self.assertGreaterEqual(score, niche.ACTIVE.export_threshold)
        self.assertEqual(verdict, "pass")

    def test_a_low_row_is_still_kept_for_storage(self):
        # 'low' rows are stored and enriched on re-scrape; only the exporter gates.
        self.assertTrue(niche.is_kept("low"))
        self.assertFalse(niche.is_kept("drop"))


if __name__ == "__main__":
    unittest.main()
