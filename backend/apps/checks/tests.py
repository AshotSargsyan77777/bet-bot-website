from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

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
        self.assertEqual(DailyCheck.objects.count(), 10)

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
        self.assertEqual(len(r.data["checks"]), 10)
        r = self.client.patch("/api/admin/checks/", {"package_key": "nope", "body_text": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.patch("/api/admin/checks/", {"package_key": "standard_10x", "body_text": "Manual check"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["ready"])


class NewMarketExplanationTests(SimpleTestCase):
    def test_corners_cards_handicap(self):
        from apps.checks.services.formatting import explain_selection

        corners = explain_selection({
            "fixture": "A - B", "market": "CORNERS_OU", "selection": "Corners Over 9.5", "probability": 0.64,
            "reasons": ["Corners over 9.5: 66%", "Corners exp 10.9 (home 5.6 / away 5.3)"],
        })
        self.assertIn("10.9", corners)
        self.assertIn("64%", corners)
        team = explain_selection({
            "fixture": "A - B", "market": "CORNERS_AWAY", "selection": "B Corners Over 4.5",
            "reasons": ["Corners exp 10.9 (home 5.6 / away 5.3)"],
        })
        self.assertIn("B-", team)
        self.assertIn("5.3", team)
        cards = explain_selection({
            "fixture": "A - B", "market": "CARDS_OU", "selection": "Cards Over 3.5", "probability": 0.6,
            "reasons": ["Cards over 3.5: 61%", "Cards exp 4.2 (home 2.0 / away 2.2)"],
        })
        self.assertIn("4.2", cards)
        ah = explain_selection({
            "fixture": "A - B", "market": "ASIAN_HANDICAP", "selection": "A −1 (Asian Handicap)",
            "reasons": ["AH −1: win 41%, push 22%", "xG 1.80/0.90"],
        })
        self.assertIn("41%", ah)
        self.assertIn("22%", ah)
        text = format_package({"combined_odds": 3.1, "selections": [
            {"fixture": "A - B", "market": "CORNERS_OU", "selection": "Corners Over 9.5", "odd": 1.8,
             "reasons": ["Corners exp 10.9 (home 5.6 / away 5.3)"]},
            {"fixture": "C - D", "market": "CARDS_OU", "selection": "Cards Over 3.5", "odd": 1.7, "reasons": []},
        ]})
        self.assertIn("🚩", text)
        self.assertIn("🟨", text)
