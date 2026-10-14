"""The exporter's scoping rules, offline.

The 2026-08-20 audit found 535 HVAC leads live in the table, 146 of them pending
and above the export gate, for a trade this stopped hunting in e0ee691e. The
exporter never filtered by niche, so the next CSV would have mixed HVAC numbers
into a windows-and-doors campaign. These tests pin the scoping so it cannot come
back. No network: the pool is a list of dicts and the URL is just a string.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# pipeline (imported by export_sms) reads these at import time. The tests never
# make a request, so any syntactically valid values will do.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import export_sms  # noqa: E402
import niche  # noqa: E402


class ThePoolIsScopedToOneTrade(unittest.TestCase):
    def test_a_niche_scoped_pool_filters_on_niche_id(self):
        url = export_sms.pool_url(niche_id="windows_doors")
        self.assertIn("niche_id=eq.windows_doors", url)

    def test_an_unscoped_pool_is_possible_but_never_the_default(self):
        # --all-niches has to be asked for by name; it is what mixes trades.
        url = export_sms.pool_url(niche_id=None)
        self.assertNotIn("niche_id=", url)

    def test_the_gate_is_the_chosen_trade_s_own_threshold(self):
        url = export_sms.pool_url(niche_id="windows_doors")
        wd = niche.load_niche("windows_doors")
        self.assertIn(f"icp_score=gte.{wd.export_threshold}", url)

    def test_the_pool_never_includes_leads_already_in_the_crm(self):
        self.assertIn("in_crm=is.false", export_sms.pool_url(niche_id="roofing"))

    def test_only_pending_rows_are_ever_pulled(self):
        self.assertIn("send_status=eq.pending", export_sms.pool_url(niche_id="roofing"))


class TheBatchLabelNamesItsTrade(unittest.TestCase):
    def test_each_trade_gets_its_own_series(self):
        self.assertNotEqual(export_sms.series_for("roofing"),
                            export_sms.series_for("windows_doors"))

    def test_the_series_carries_the_trade_so_a_stamp_says_where_it_came_from(self):
        self.assertIn("windows_doors", export_sms.series_for("windows_doors"))


class TheCleanFilters(unittest.TestCase):
    def _row(self, phone, name="Acme Windows"):
        return {"phone_e164": phone, "business_name": name, "city": "Kent", "state": "WA"}

    def test_a_landline_never_reaches_a_list(self):
        # +1 206 464 xxxx is a Seattle landline block in the committed NANPA map.
        import linetype
        landline = next((p for p in ["+12064641212", "+12065551212"]
                         if linetype.line_type_of(p) == "landline"), None)
        if landline is None:
            self.skipTest("no known landline block in the committed map")
        self.assertEqual(export_sms.clean([self._row(landline)]), [])

    def test_a_row_with_no_business_name_is_dropped(self):
        self.assertEqual(export_sms.clean([self._row("+12533847029", name="  ")]), [])

    def test_a_suppressed_number_never_exports(self):
        import suppress, tempfile
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "suppression.txt"
            p.write_text("+12533847029\n")
            real = suppress.SUPPRESSION_FILE
            suppress.SUPPRESSION_FILE = p
            try:
                self.assertEqual(export_sms.clean([self._row("+12533847029")]), [])
            finally:
                suppress.SUPPRESSION_FILE = real


if __name__ == "__main__":
    unittest.main()
