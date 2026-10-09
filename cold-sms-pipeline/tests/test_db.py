"""One database file per trade, so trades never share searches, leads or reprocess runs."""

import unittest

from pipeline.config import DATA
from pipeline.db import db_path


class PerTrade(unittest.TestCase):
    def test_hvac_keeps_the_file_it_was_scraped_into(self):
        self.assertEqual(db_path("hvac"), DATA / "leads.db")

    def test_every_other_trade_gets_its_own_file(self):
        self.assertEqual(db_path("windows_doors"), DATA / "windows_doors.db")
