from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from apps.checks.constants import PACKAGES
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.formatting import format_package
from apps.checks.services.time import yerevan_today
from apps.commerce.models import PromoCode

PACKAGE = {
    "tier": "standard",
    "package": "3x",
    "available": True,
    "combined_odds": 3.2,
    "quality": "strict",
    "selections": [
        {"fixture": "A - B", "fixture_id": 1, "market": "MATCH_WINNER", "selection": "A (Home Win)", "odd": 1.6},
        {"fixture": "C - D", "fixture_id": 2, "market": "BTTS", "selection": "Yes", "odd": 2.0},
    ],
}


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


@override_settings(N8N_INTERNAL_KEY="secret-key", PROMOS_PER_UPDATE=2)
class WebhookAndCatalogTests(APITestCase):
    def post_packages(self, packages, key="secret-key"):
        return self.client.post(
            "/api/internal/packages/", {"packages": packages}, format="json", HTTP_X_INTERNAL_KEY=key
        )

    def test_seeded_defaults(self):
        self.assertEqual(DailyCheck.objects.count(), len(PACKAGES))

    def test_webhook_auth_and_validation(self):
        self.assertEqual(self.post_packages([PACKAGE], key="wrong").status_code, 401)
        self.assertEqual(self.post_packages([PACKAGE], key="").status_code, 401)
        r = self.client.post(
            "/api/internal/packages/", {"packages": "x"}, format="json", HTTP_X_INTERNAL_KEY="secret-key"
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.post_packages(["bad"]).status_code, 400)

    def test_webhook_updates_checks_and_catalog(self):
        r = self.post_packages([PACKAGE, {"tier": "standard", "package": "5x", "available": False}])
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["available"], 1)
        self.assertEqual(r.data["ready"], ["standard_3x"])
        self.assertEqual(len(r.data["new_promo_codes"]), 2)
        self.assertEqual(PromoCode.objects.count(), 2)
        self.assertEqual(AppSettings.get().checks_date, yerevan_today())

        cat = self.client.get("/api/checks/catalog/")
        self.assertEqual(cat.status_code, 200)
        by_key = {p["key"]: p for p in cat.data["packages"]}
        self.assertTrue(by_key["standard_3x"]["ready"])
        self.assertFalse(by_key["standard_5x"]["ready"])
        self.assertEqual(cat.data["card_number"], "")  # hidden from anonymous visitors

        summary = self.client.get("/api/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["ready_packages"], 1)

    def test_admin_checks_requires_admin_and_validates(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user("u", "u@example.com", "x")
        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/admin/checks/").status_code, 403)
        self.client.force_authenticate(admin)
        r = self.client.get("/api/admin/checks/")
        self.assertEqual(len(r.data["checks"]), len(PACKAGES))
        r = self.client.patch("/api/admin/checks/", {"package_key": "nope", "body_text": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.patch("/api/admin/checks/", {"package_key": "standard_10x", "body_text": "Manual check"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["ready"])


class ExplanationTests(SimpleTestCase):
    BASE = ["xG 1.80/0.90", "xG total 2.70", "Form: home 80% vs away 40%", "H2H 3-1-1 in 5",
            "Injuries: home 0 / away 2", "Corners exp 10.9 (home 5.6 / away 5.3)", "Cards exp 4.2 (home 2.0 / away 2.2)"]

    def explain(self, market, selection, extra=()):
        from apps.checks.services.formatting import explain_selection

        return explain_selection({"fixture": "A - B", "market": market, "selection": selection,
                                  "reasons": [*extra, *self.BASE]})

    def test_every_market_has_short_explanation(self):
        cases = [
            ("MATCH_WINNER", "A (Home Win)"), ("DOUBLE_CHANCE", "B or Draw"), ("DNB", "Draw No Bet — A"),
            ("BTTS", "Both Teams To Score - Yes"), ("BTTS", "Both Teams To Score - No"),
            ("OU", "Over 2.5"), ("OU", "Under 3.5"), ("TEAM_TOTAL_HOME", "A Over 1.5 Goals"),
            ("TEAM_TOTAL_AWAY", "B Under 1.5 Goals"), ("OU_1H", "1st Half Over 0.5"),
            ("CLEAN_SHEET_HOME", "A Clean Sheet - Yes"), ("WIN_TO_NIL_AWAY", "B Win To Nil - No"),
            ("CORNERS_OU", "Corners Over 9.5"), ("CORNERS_AWAY", "B Corners Over 4.5"), ("CARDS_OU", "Cards Under 4.5"),
        ]
        for market, selection in cases:
            text = self.explain(market, selection)
            self.assertTrue(text, (market, selection))
            self.assertLessEqual(len(text), 90, (market, text))

    def test_content(self):
        self.assertIn("10.9", self.explain("CORNERS_OU", "Corners Over 9.5"))
        self.assertIn("5.3", self.explain("CORNERS_AWAY", "B Corners Over 4.5"))
        self.assertIn("4.2", self.explain("CARDS_OU", "Cards Over 3.5"))
        ah = self.explain("ASIAN_HANDICAP", "A −1 (Asian Handicap)", ["AH −1: win 41%, push 22%"])
        self.assertIn("41%", ah)
        self.assertIn("22%", ah)
        mw = self.explain("MATCH_WINNER", "A (Home Win)")
        for fact in ("ձև", "3/5", "1.8"):
            self.assertIn(fact, mw)
        from apps.checks.services.formatting import explain_selection

        injured = explain_selection({"fixture": "A - B", "market": "MATCH_WINNER", "selection": "A (Home Win)",
                                     "reasons": ["xG 1.50/1.40", "Injuries: home 0 / away 2"]})
        self.assertIn("2 բացակա", injured)

    def test_package_shows_probability_row(self):
        text = format_package({"combined_odds": 3.1, "selections": [
            {"fixture": "A - B", "market": "CORNERS_OU", "selection": "Corners Over 9.5", "odd": 1.8,
             "probability": 0.64, "reasons": self.BASE},
            {"fixture": "C - D", "market": "CARDS_OU", "selection": "Cards Over 3.5", "odd": 1.7, "reasons": []},
        ]})
        self.assertIn("🚩", text)
        self.assertIn("🟨", text)
        self.assertIn("📊 Հավանականություն՝ 64%", text)
