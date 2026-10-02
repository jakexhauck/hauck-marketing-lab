"""Keep/drop and sub-category, on real listings pulled from past scrapes."""

import unittest

from pipeline.config import load_trade
from pipeline.filter import judge, service_for

T = load_trade("hvac")


def listing(title, categories, reviews=50):
    return {"title": title, "category": categories[0], "categories": categories,
            "review_count": reviews}


class Keeps(unittest.TestCase):
    def assertKept(self, row):
        keep, reason = judge(row, T)
        self.assertTrue(keep, f"{row['title']} dropped: {reason}")

    def test_plain_hvac_contractor(self):
        self.assertKept(listing("Koz Heating & Cooling",
                                ["HVAC contractor", "Air conditioning contractor", "Boiler supplier"], 314))

    def test_ac_repair_primary(self):
        self.assertKept(listing("LEO'S HEATING AND COOLING",
                                ["Air conditioning repair service", "Furnace repair service"], 171))

    def test_plumber_who_says_heating_in_the_name(self):
        self.assertKept(listing("McQuade Heating & Cooling Plumbing & Refrigeration",
                                ["Plumber", "Air conditioning contractor", "HVAC contractor"], 380))

    def test_mechanical_contractor_named_for_comfort(self):
        self.assertKept(listing("Engineered Comfort Systems Inc",
                                ["Mechanical contractor", "Heating contractor", "HVAC contractor"], 14))

    def test_hvac_match_anywhere_in_ten_categories(self):
        # The HVAC category is LAST of a long list; it still counts.
        cats = ["Service establishment", "Electrician", "Drainage service", "Hot water system supplier",
                "Air filter supplier", "Fireplace store", "Chimney sweep", "Insulation contractor",
                "Sheet metal contractor", "HVAC contractor"]
        self.assertKept(listing("Valley Heating and Air", cats))


class Drops(unittest.TestCase):
    def assertDropped(self, row, why):
        keep, reason = judge(row, T)
        self.assertFalse(keep, f"{row['title']} kept")
        self.assertIn(why, reason)

    def test_supply_house(self):
        self.assertDropped(listing("Kalamazoo HVAC Center",
                                   ["Heating equipment supplier", "Air conditioning system supplier"]), "category")

    def test_supply_word_in_name(self):
        self.assertDropped(listing("Metro Heating Supply", ["HVAC contractor"]), "name")

    def test_supply_house_listed_as_contractor(self):
        self.assertDropped(listing("Trane Supply",
                                   ["HVAC contractor", "Industrial equipment supplier"]), "franchise")

    def test_duct_cleaner(self):
        self.assertDropped(listing("USA Pro-Vac",
                                   ["Air duct cleaning service", "Furnace repair service"], 200), "category")

    def test_plumber_without_hvac_name(self):
        self.assertDropped(listing("PM Plumbing & Mechanical",
                                   ["Plumber", "Furnace repair service", "HVAC contractor"]), "name")

    def test_plumber_with_name_but_no_hvac_category(self):
        self.assertDropped(listing("Joe's Plumbing & Air", ["Plumber", "Drainage service"]), "category")

    def test_franchise(self):
        self.assertDropped(listing("Aire Serv of Southern Michigan", ["HVAC contractor"], 505), "franchise")

    def test_appliance_repair(self):
        self.assertDropped(listing("Sears Appliance Repair",
                                   ["Appliance repair service", "Furnace repair service"]), "franchise")

    def test_general_contractor(self):
        self.assertDropped(listing("Affordable Contracting and Remodeling",
                                   ["General contractor", "HVAC contractor"]), "category")

    def test_auto_ac(self):
        self.assertDropped(listing("Midas", ["Auto repair shop", "Auto air conditioning service"]), "category")

    def test_commercial_shop(self):
        self.assertDropped(listing("Metro Refrigeration LLC your commercial refrigeration specialists",
                                   ["HVAC contractor"]), "name")

    def test_too_big(self):
        self.assertDropped(listing("AJ Danboise", ["Air conditioning repair service"], 2973), "reviews")


class FranchiseWholeWords(unittest.TestCase):
    def test_lookalike_names_are_not_franchises(self):
        for title in ("Robin Aire Service Company", "Flowes Heating & Cooling", "Lowest Price Heating"):
            keep, reason = judge(listing(title, ["HVAC contractor"]), T)
            self.assertTrue(keep, f"{title}: {reason}")


class CommercialEscape(unittest.TestCase):
    def test_residential_and_commercial_is_kept(self):
        keep, reason = judge(listing("ABC Residential & Commercial Heating", ["HVAC contractor"]), T)
        self.assertTrue(keep, reason)


class Service(unittest.TestCase):
    def test_default(self):
        self.assertEqual(service_for("Koz Heating & Cooling", T), "AC and furnace")

    def test_boiler_category_alone_is_not_a_boiler_shop(self):
        # Briarwood lists 'Boiler supplier' but the name says nothing about boilers.
        self.assertEqual(service_for("Briarwood Heating & Cooling", T), "AC and furnace")

    def test_boiler_from_name(self):
        self.assertEqual(service_for("Detroit Boiler & Hydronics", T), "boiler")

    def test_heat_pump_from_name(self):
        self.assertEqual(service_for("Allegiance Heat Pumps LLC", T), "heat pump")

    def test_geothermal_is_heat_pump(self):
        self.assertEqual(service_for("Great Lakes Geothermal", T), "heat pump")

    def test_boiler_beats_heat_pump(self):
        self.assertEqual(service_for("Boilers and Heat Pumps Inc", T), "boiler")


if __name__ == "__main__":
    unittest.main()
