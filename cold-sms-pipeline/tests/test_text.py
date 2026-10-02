"""Phones, names, the GSM-7 check and message rendering."""

import unittest

from pipeline.text import (clean_name, is_gsm7, normalize_phone, render, sanitize,
                           split_messages)


class Phones(unittest.TestCase):
    def test_us_formats(self):
        for raw in ("(517) 836-3094", "517-836-3094", "+1 517 836 3094", "15178363094", "517.836.3094"):
            self.assertEqual(normalize_phone(raw), "+15178363094", raw)

    def test_rejects_junk(self):
        for raw in ("", None, "836-3094", "+44 20 7946 0958", "123-456-7890"):
            self.assertIsNone(normalize_phone(raw), raw)

    def test_rejects_toll_free(self):
        self.assertIsNone(normalize_phone("(800) 555-1234"))
        self.assertIsNone(normalize_phone("888-555-1234"))


class Names(unittest.TestCase):
    def test_strips_legal_suffix(self):
        self.assertEqual(clean_name("Allegiance Heat Pumps LLC"), "Allegiance Heat Pumps")
        self.assertEqual(clean_name("Tempco Mechanical Contractors, Inc."), "Tempco Mechanical Contractors")

    def test_keeps_ordinary_name(self):
        self.assertEqual(clean_name("Koz Heating & Cooling"), "Koz Heating & Cooling")

    def test_smart_quotes_fixed(self):
        self.assertEqual(clean_name("Leo’s Heating"), "Leo's Heating")


class Gsm7(unittest.TestCase):
    def test_plain_text_is_gsm(self):
        self.assertTrue(is_gsm7("Hey, it's Jake. Quick one for Koz Heating & Cooling?"))

    def test_curly_quote_is_not(self):
        self.assertFalse(is_gsm7("it’s"))

    def test_sanitize_fixes_the_usual_suspects(self):
        out = sanitize("“Hi” — it’s… a test – ok")
        self.assertTrue(is_gsm7(out))
        self.assertEqual(out, '"Hi" - it\'s... a test - ok')

    def test_emoji_survives_sanitize_and_is_flagged(self):
        self.assertFalse(is_gsm7(sanitize("Thanks \U0001F600")))


class Render(unittest.TestCase):
    LEAD = {"company_name": "Koz Heating & Cooling", "city": "Troy", "state": "MI", "service": "AC and furnace"}

    def test_fills_fields(self):
        text, missing = render("{{contact.company_name}} in {{contact.city}}: {{contact.service}}", self.LEAD)
        self.assertEqual(text, "Koz Heating & Cooling in Troy: AC and furnace")
        self.assertEqual(missing, [])

    def test_reports_blank_field(self):
        _, missing = render("Hi {{contact.city}}", {**self.LEAD, "city": ""})
        self.assertEqual(missing, ["city"])

    def test_reports_unknown_field(self):
        _, missing = render("Hi {{contact.first_name}}", self.LEAD)
        self.assertEqual(missing, ["first_name"])

    def test_tolerates_spaces_in_braces(self):
        text, _ = render("{{ contact.city }}", self.LEAD)
        self.assertEqual(text, "Troy")


class Split(unittest.TestCase):
    def test_messages_split_on_dashes_and_skip_comments(self):
        raw = "# comment\nText one\n---\nText two\nline 2\n---\n\n"
        self.assertEqual(split_messages(raw), ["Text one", "Text two\nline 2"])


if __name__ == "__main__":
    unittest.main()
