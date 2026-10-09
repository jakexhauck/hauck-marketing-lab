"""Windows and doors, on real listings from the 2026-10-09 Michigan pilot."""

import unittest

from pipeline.config import load_trade
from pipeline.filter import judge, service_for

T = load_trade("windows_doors")


def listing(title, categories, reviews=50):
    return {"title": title, "category": categories[0], "categories": categories,
            "review_count": reviews}


class WindowsDoors(unittest.TestCase):
    def assertKept(self, title, cats):
        keep, reason = judge(listing(title, cats), T)
        self.assertTrue(keep, f"{title} dropped: {reason}")

    def assertDropped(self, title, cats):
        keep, reason = judge(listing(title, cats), T)
        self.assertFalse(keep, f"{title} kept: {reason}")

    def test_window_installer(self):
        self.assertKept("Polar Seal Windows", ["Window installation service"])

    def test_door_only_shop_counts(self):
        self.assertKept("AK Door Solutions LLC", ["Door supplier"])

    def test_installer_filed_as_window_supplier_only(self):
        self.assertKept("Warren Window Replacement", ["Window supplier"])

    def test_installer_filed_as_door_supplier_only(self):
        self.assertKept("East Pointe Window & Door", ["Door supplier"])

    def test_supplier_whose_name_says_nothing(self):
        self.assertDropped("Duraweld Industries", ["Door supplier"])

    def test_door_supplier_that_does_garage_doors(self):
        self.assertDropped("Jan Door", ["Door supplier", "Door shop", "Garage door supplier"])

    def test_door_and_window_shop_that_also_lists_garage_doors(self):
        self.assertKept("Taylor Door and Window Company",
                        ["Door shop", "Door supplier", "Garage door supplier", "Window installation service"])

    def test_exteriors_firm_with_window_category(self):
        self.assertKept("3G Home Exteriors",
                        ["Siding contractor", "Gutter service", "Roofing contractor", "Window installation service"])

    def test_plain_glass_shop(self):
        self.assertDropped("Trenko Glass", ["Glass & mirror shop"])

    def test_handyman(self):
        self.assertDropped("Upscale Handyman", ["Handyman/Handywoman/Handyperson", "Carpenter"])

    def test_garage_door_company(self):
        self.assertDropped("Detroit Garage Doors", ["Garage door supplier"])

    def test_auto_glass(self):
        self.assertDropped("Lincoln Park Auto Glass", ["Auto glass shop"])

    def test_window_tint(self):
        self.assertDropped("Motor City Window Tinting", ["Window tinting service"])

    def test_franchise(self):
        self.assertDropped("Renewal by Andersen of Detroit", ["Window installation service"])

    def test_service_is_window_and_door(self):
        self.assertEqual(service_for("AK Door Solutions LLC", T), "window and door")


if __name__ == "__main__":
    unittest.main()
