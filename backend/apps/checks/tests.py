from django.test import SimpleTestCase

from apps.checks.services.formatting import format_package
from apps.checks.services.time import yerevan_today


class YerevanTodayTests(SimpleTestCase):
    def test_format_yyyy_mm_dd(self):
        self.assertRegex(yerevan_today(), r"^\d{4}-\d{2}-\d{2}$")


class FormatPackageTests(SimpleTestCase):
    def test_minimal_package(self):
        text = format_package(
            {
                "combined_odds": 3.5,
                "selections": [
                    {"fixture": "A - B", "market": "MATCH_WINNER", "selection": "A", "odd": 1.5},
                ],
            }
        )
        self.assertIn("GOALKING", text)
        self.assertIn("3.50", text)
