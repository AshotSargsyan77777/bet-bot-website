from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today
from apps.combinator.search import build_candidate_pool, search_combinations
from apps.commerce.models import SelectionCandidate, VipMember

User = get_user_model()


class SearchAlgorithmTests(SimpleTestCase):
    def test_finds_combinations_in_target_range(self):
        pool = build_candidate_pool(
            [[{"fixture": f"T{i} - U{i}", "fixture_id": i, "market": "OU", "selection": "Over 1.5", "odd": 1.5} for i in range(6)]],
            [],
        )
        res = search_combinations(pool, target_min=3.0, target_max=3.5, legs_count=3)
        self.assertTrue(res["results"])
        for combo in res["results"]:
            self.assertEqual(combo["legs_count"], 3)
            self.assertTrue(3.0 <= combo["combined_odds"] <= 3.5)


class CombinatorApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("v", "v@example.com", "x")
        VipMember.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        sel = [
            {"fixture": "A - B", "fixture_id": 1, "market": "MATCH_WINNER", "selection": "A (Home Win)", "odd": 1.4},
            {"fixture": "C - D", "fixture_id": 2, "market": "OU", "selection": "Over 2.5", "odd": 1.5},
        ]
        DailyCheck.objects.filter(package_key="standard_3x").update(body_text="check", is_available=True, selections_json=sel)
        app = AppSettings.get()
        app.checks_date = yerevan_today()
        app.save()
        SelectionCandidate.objects.create(fixture_name="E - F", market="BTTS", selection="Yes", odd=1.6)

    def test_pool_and_search(self):
        pool = self.client.get("/api/combinator/pool/")
        self.assertEqual(pool.data["count"], 3)
        r = self.client.post(
            "/api/combinator/search/",
            {"target_odds_min": 3, "target_odds_max": 3.5, "legs_count": 3, "leg_odds_min": 1.1, "leg_odds_max": 2},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data["results"]), 1)
        self.assertAlmostEqual(r.data["results"][0]["combined_odds"], 3.36, places=2)

    def test_validation(self):
        for payload in (
            {"target_odds_min": "abc"},
            {"target_odds_min": 10, "target_odds_max": 5},
            {"legs_count": 100},
            {"leg_odds_min": 3, "leg_odds_max": 2},
        ):
            r = self.client.post("/api/combinator/search/", payload, format="json")
            self.assertEqual(r.status_code, 400, payload)
            self.assertIn("error", r.data)
