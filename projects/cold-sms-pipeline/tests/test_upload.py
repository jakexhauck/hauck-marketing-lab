"""Upload: the same checked leads the CSV takes, sent to the app's Cold SMS Leads tab, once."""

import unittest

from pipeline.config import load_trade
from pipeline.db import connect
from pipeline.upload import UploadStopped, upload
from tests.test_export import MESSAGES, add

T = load_trade("hvac")


class Upload(unittest.TestCase):
    def setUp(self):
        self.con = connect(":memory:")
        self.sent = []

    def post(self, rows):
        self.sent.append(rows)

    def run_upload(self, **kw):
        return upload(self.con, T, MESSAGES, self.post, **kw)

    def test_textable_lead_goes_up_with_the_app_columns(self):
        add(self.con, "+12485550134")
        self.con.execute("update leads set website='https://k.com/?utm_source=google'")
        self.assertEqual(self.run_upload()["count"], 1)
        [[row]] = self.sent
        self.assertEqual(row, {
            "phone": "+12485550134", "company_name": "Koz Heating", "city": "Troy", "state": "MI",
            "timezone": "America/Detroit", "website": "https://k.com/", "service": "AC and furnace",
            "line_type": "mobile", "trade": "hvac",
        })

    def test_never_uploaded_twice(self):
        add(self.con, "+12485550134")
        self.run_upload()
        self.assertEqual(self.run_upload()["count"], 0)
        self.assertEqual(len(self.sent), 1)

    def test_landline_unchecked_and_bad_names_stay_down(self):
        add(self.con, "+12485550001", line="landline")
        add(self.con, "+12485550002", line=None)
        add(self.con, "+12485550003", name="Cool Air \U0001F600")
        result = self.run_upload()
        self.assertEqual(result["count"], 0)
        self.assertEqual(len(result["skipped"]), 1)
        self.assertEqual(self.sent, [])

    def test_already_in_a_csv_stays_down(self):
        add(self.con, "+12485550134")
        self.con.execute("update leads set exported_at='2026-10-01'")
        self.assertEqual(self.run_upload()["count"], 0)

    def test_sent_in_chunks(self):
        for i in range(5):
            add(self.con, f"+1248555010{i}")
        self.run_upload(chunk=2)
        self.assertEqual([len(c) for c in self.sent], [2, 2, 1])

    def test_failed_chunk_keeps_earlier_chunks_and_stops(self):
        for i in range(3):
            add(self.con, f"+1248555010{i}")

        def flaky(rows):
            if self.sent:
                raise UploadStopped("500 from Supabase")
            self.sent.append(rows)

        with self.assertRaises(UploadStopped):
            upload(self.con, T, MESSAGES, flaky, chunk=2)
        # The first chunk landed and is marked, so a rerun sends only the rest.
        self.sent = []
        self.assertEqual(self.run_upload()["count"], 1)


if __name__ == "__main__":
    unittest.main()
