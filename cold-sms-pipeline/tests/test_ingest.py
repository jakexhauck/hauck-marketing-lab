"""Listing -> stored lead: phone dedupe, state scope, the stored verdict."""

import unittest

from pipeline.config import load_trade
from pipeline.db import connect
from pipeline.ingest import ingest, reprocess

T = load_trade("hvac")


def raw(cid, title, phone, city="Troy", state="Michigan", cats=("HVAC contractor",), reviews=40):
    return {"cid": cid, "title": title, "phone": phone, "category": cats[0], "categories": list(cats),
            "review_count": reviews, "web_site": "https://example.com", "timezone": "America/Detroit",
            "complete_address": {"city": city, "state": state, "country": "US"}}


class Ingest(unittest.TestCase):
    def setUp(self):
        self.con = connect(":memory:")

    def leads(self):
        return {r["phone"]: dict(r) for r in self.con.execute("select * from leads")}

    def test_kept_lead_is_stored_with_service_and_clean_name(self):
        ingest(self.con, [raw("1", "Koz Heating & Cooling LLC", "(248) 555-0134")], T)
        lead = self.leads()["+12485550134"]
        self.assertEqual(lead["keep"], 1)
        self.assertEqual(lead["company_name"], "Koz Heating & Cooling")
        self.assertEqual(lead["service"], "AC and furnace")
        self.assertEqual(lead["state"], "MI")
        self.assertEqual(lead["timezone"], "America/Detroit")

    def test_same_phone_twice_is_one_lead(self):
        stats = ingest(self.con, [raw("1", "Koz Heating", "248-555-0134"),
                                  raw("2", "Koz Heating & Cooling", "+1 248 555 0134")], T)
        self.assertEqual(len(self.leads()), 1)
        self.assertEqual(stats["duplicate"], 1)

    def test_second_run_does_not_duplicate(self):
        ingest(self.con, [raw("1", "Koz Heating", "248-555-0134")], T)
        stats = ingest(self.con, [raw("1", "Koz Heating", "248-555-0134")], T)
        self.assertEqual(stats["new"], 0)

    def test_outside_target_states_is_dropped(self):
        ingest(self.con, [raw("1", "Lone Star Heating", "214-555-0134", "Dallas", "Texas")], T)
        lead = self.leads()["+12145550134"]
        self.assertEqual(lead["keep"], 0)
        self.assertIn("outside", lead["reason"])

    def test_canadian_address_is_not_the_search_state(self):
        self.con.execute("insert into queries (id, query, city, state) values ('q1','x','Detroit','MI')")
        row = {**raw("1", "Windsor Heating", "519-555-0134", "Windsor", "Ontario"), "input_id": "q1"}
        row["complete_address"]["country"] = "CA"
        ingest(self.con, [row], T)
        lead = self.leads()["+15195550134"]
        self.assertEqual(lead["keep"], 0)
        self.assertIn("outside", lead["reason"])

    def test_hidden_address_takes_the_search_city(self):
        self.con.execute("insert into queries (id, query, city, state) values ('q1','x','Taylor','MI')")
        row = {**raw("1", "Motown Heating", "313-555-0134", city="", state=""), "input_id": "q1"}
        ingest(self.con, [row], T)
        lead = self.leads()["+13135550134"]
        self.assertEqual((lead["keep"], lead["city"], lead["state"]), (1, "Taylor", "MI"))

    def test_hidden_address_from_unknown_search_is_dropped(self):
        ingest(self.con, [raw("1", "Motown Heating", "313-555-0134", city="", state="")], T)
        self.assertEqual(self.leads()["+13135550134"]["keep"], 0)

    def test_no_usable_phone_is_not_stored(self):
        stats = ingest(self.con, [raw("1", "Koz Heating", ""), raw("2", "Free Heat", "(800) 555-0134")], T)
        self.assertEqual(self.leads(), {})
        self.assertEqual(stats["no_phone"], 2)

    def test_dropped_lead_keeps_its_reason(self):
        ingest(self.con, [raw("1", "Johnstone Supply", "248-555-0199")], T)
        self.assertIn("franchise", self.leads()["+12485550199"]["reason"])

    def test_reprocess_applies_new_rules_but_keeps_lookups(self):
        ingest(self.con, [raw("1", "Koz Heating", "248-555-0134")], T)
        self.con.execute("update leads set line_type='mobile'")
        strict = {**T, "franchises": T["franchises"] + ["koz"]}
        reprocess(self.con, strict)
        lead = self.leads()["+12485550134"]
        self.assertEqual(lead["keep"], 0)
        self.assertEqual(lead["line_type"], "mobile")


if __name__ == "__main__":
    unittest.main()
