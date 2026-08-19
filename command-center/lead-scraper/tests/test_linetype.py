"""The line-type filter is the one that throws leads away, so it is the one worth
pinning down. Two halves:

  - the classifier reading a NANPA file, on a fixture rather than the live download,
    so the test says nothing about the network and everything about the parsing;
  - the shipped map, sanity-checked for shape rather than for any given number,
    because the real file changes daily and a test that asserted "this NXX is a
    mobile" would fail the first time a block changed hands.

    .venv/bin/python -m unittest discover -s tests -v
"""

from __future__ import annotations

import gzip
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import linetype  # noqa: E402

HEADER = "State\tNPA-NXX\tOCN\tCompany\tRateCenter\n"

# One row per carrier shape the real file actually contains. The wireless ones are
# the legacy names that matter: AT&T's blocks say Cingular, Verizon's say Cellco,
# and T-Mobile's say Omnipoint, Powertel or Aerial as often as they say T-Mobile.
ROWS = [
    ("MI", "586-921", '"NEW CINGULAR WIRELESS PCS, LLC - IL"', "W"),
    ("NY", "212-555", '"CELLCO PARTNERSHIP DBA VERIZON WIRELESS"', "W"),
    ("TX", "832-848", '"T-MOBILE USA, INC."', "W"),
    ("NJ", "201-200", '"OMNIPOINT COMMUNICATIONS, INC. - NY"', "W"),
    ("GA", "404-201", '"POWERTEL ATLANTA LICENSES, INC."', "W"),
    ("IL", "312-202", '"AERIAL COMMUNICATIONS, INC."', "W"),
    ("CA", "530-555", '"PACIFIC BELL"', "L"),
    ("CO", "303-555", '"QWEST CORPORATION"', "L"),
    ("PA", "215-555", '"COMCAST IP PHONE, LLC"', "L"),
    # Paging, not mobile. It is the trap in the data: a paging carrier looks like a
    # mobile one to anybody matching on "communications" or "messaging".
    ("TX", "214-555", '"SPOK, INC."', "L"),
    ("NC", "919-555", '"BANDWIDTH.COM CLEC, LLC - CA"', "L"),
]


def _fixture(path: Path) -> None:
    body = HEADER + "".join(
        f"{state}\t{code}\t1234\t{company}\tSOMEWHERE\n" for state, code, company, _ in ROWS
    )
    path.write_bytes(body.encode("latin-1"))


class BuildsTheMap(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        raw = self.tmp / "nanpa.txt"
        _fixture(raw)
        self.built = linetype.build_map(raw.read_bytes())

    def test_every_fixture_row_lands_on_its_expected_side(self):
        for state, code, company, expected in ROWS:
            with self.subTest(company=company):
                self.assertEqual(self.built[code.replace("-", "")], expected)

    def test_paging_is_not_a_mobile(self):
        self.assertEqual(self.built["214555"], "L")

    def test_the_header_row_is_not_read_as_a_block(self):
        self.assertEqual(len(self.built), len(ROWS))


class LooksUpANumber(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.path = self.tmp / "map.txt.gz"
        with gzip.open(self.path, "wt", encoding="ascii") as fh:
            fh.write("# fixture\n")
            for _, code, _, flag in ROWS:
                fh.write(f"{code.replace('-', '')}\t{flag}\n")
        self.map = linetype.load(self.path)
        # load(path) deliberately does not populate the module cache, so point the
        # module at the fixture for the lookups below and put it back afterwards.
        self._saved = linetype._MAP
        linetype._MAP = self.map

    def tearDown(self):
        linetype._MAP = self._saved

    def test_reads_e164_and_bare_ten_digit_alike(self):
        for number in ("+15869218699", "15869218699", "5869218699", "(586) 921-8699"):
            with self.subTest(number=number):
                self.assertEqual(linetype.line_type_of(number), linetype.WIRELESS)

    def test_a_landline_block_reads_landline(self):
        self.assertEqual(linetype.line_type_of("+15305551234"), linetype.LANDLINE)
        self.assertFalse(linetype.is_mobile("+15305551234"))

    def test_a_block_outside_the_file_is_unknown_not_guessed(self):
        # Toll-free is the live case: 8xx blocks are not in the utilised-codes file
        # at all, and calling them landline would be inventing an answer.
        self.assertEqual(linetype.line_type_of("+18005551212"), linetype.UNKNOWN)

    def test_a_non_us_number_is_unknown(self):
        self.assertEqual(linetype.line_type_of("+447911123456"), linetype.UNKNOWN)

    def test_junk_is_unknown_rather_than_an_exception(self):
        for number in ("", "not a phone", "+1", None):
            with self.subTest(number=number):
                self.assertEqual(linetype.line_type_of(number), linetype.UNKNOWN)


class TheShippedMap(unittest.TestCase):
    """Shape only. The file is regenerated from NANPA and its contents move."""

    def test_it_is_committed_and_covers_the_country(self):
        self.assertTrue(linetype.DATA_PATH.exists(), "run: python linetype.py --refresh")
        loaded = linetype.load()
        self.assertGreater(len(loaded), 150_000)
        wireless = sum(1 for v in loaded.values() if v == linetype.WIRELESS)
        # Roughly a quarter to a third of assigned blocks are mobile. Either end
        # being wildly out means the carrier match, not the data, has broken.
        self.assertGreater(wireless / len(loaded), 0.15)
        self.assertLess(wireless / len(loaded), 0.50)


if __name__ == "__main__":
    unittest.main()
