"""The do-not-contact list, offline.

The list existed as a function nobody could reach: `merge_suppressed` was tested
and correct, and nothing called it from anywhere a human sits. The moment somebody
asks not to be contacted that has to be one command, and it has to be permanent.
These tests pin the command's behaviour. No network: every case is a temp file.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import suppress  # noqa: E402


class ANumberIsNormalisedBeforeItIsStored(unittest.TestCase):
    def test_a_number_typed_the_way_a_human_says_it_becomes_e164(self):
        good, bad = suppress.parse_numbers(["(206) 555-0142", "206-555-0143"])
        self.assertEqual(good, ["+12065550142", "+12065550143"])
        self.assertEqual(bad, [])

    def test_an_already_e164_number_survives_untouched(self):
        good, _ = suppress.parse_numbers(["+12065550142"])
        self.assertEqual(good, ["+12065550142"])

    def test_rubbish_is_reported_rather_than_stored(self):
        # A typo silently stored is worse than a typo refused: the number that
        # should have been suppressed stays exportable and nobody finds out.
        good, bad = suppress.parse_numbers(["not a phone", "555", "+12065550142"])
        self.assertEqual(good, ["+12065550142"])
        self.assertEqual(bad, ["not a phone", "555"])


class TheFileSurvivesBeingWrittenTo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "suppression.txt"
        self.path.write_text("# Permanent do-not-contact list.\n# One E.164 per line.\n")
        self.addCleanup(self.dir.cleanup)

    def test_the_header_explaining_the_file_is_kept(self):
        # merge_suppressed rewrote the whole file from the numbers it had loaded,
        # and load ignores comments, so the first ever entry deleted the four lines
        # saying what the file is and why it is in git.
        suppress.merge_suppressed(["+12065550142"], self.path)
        text = self.path.read_text()
        self.assertIn("# Permanent do-not-contact list.", text)
        self.assertIn("# One E.164 per line.", text)
        self.assertIn("+12065550142", text)

    def test_numbers_are_sorted_and_never_duplicated(self):
        suppress.merge_suppressed(["+12065550143", "+12065550142"], self.path)
        added, total = suppress.merge_suppressed(["+12065550142"], self.path)
        self.assertEqual((added, total), (0, 2))
        numbers = [l for l in self.path.read_text().splitlines() if not l.startswith("#")]
        self.assertEqual([n for n in numbers if n], ["+12065550142", "+12065550143"])

    def test_a_second_call_adds_to_the_list_rather_than_replacing_it(self):
        suppress.merge_suppressed(["+12065550142"], self.path)
        added, total = suppress.merge_suppressed(["+12065550144"], self.path)
        self.assertEqual((added, total), (1, 2))
        self.assertEqual(suppress.load_suppressed(self.path),
                         frozenset({"+12065550142", "+12065550144"}))

    def test_a_missing_file_is_created_rather_than_refused(self):
        fresh = Path(self.dir.name) / "new.txt"
        added, total = suppress.merge_suppressed(["+12065550142"], fresh)
        self.assertEqual((added, total), (1, 1))
        self.assertTrue(fresh.exists())


class TheListIsReadTheSameWayByEverything(unittest.TestCase):
    def test_comments_and_blank_lines_are_not_numbers(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "s.txt"
            p.write_text("# a comment\n\n+12065550142\n\n")
            self.assertEqual(suppress.load_suppressed(p), frozenset({"+12065550142"}))


if __name__ == "__main__":
    unittest.main()
