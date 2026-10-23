import io
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today
from apps.combinator.models import ComboOrder
from apps.combinator.search import build_candidate_pool, search_combinations
from apps.combinator.views import current_pool
from apps.commerce.models import Payment, SelectionCandidate, VipMember
from apps.games.models import FixtureCache

User = get_user_model()
MEDIA = tempfile.mkdtemp()


def receipt():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return SimpleUploadedFile("r.png", buf.getvalue(), content_type="image/png")


class SearchAlgorithmTests(SimpleTestCase):
    def test_up_to_n_legs_one_pick_per_match_sorted_by_chance(self):
        sel = [{"fixture": f"T{i} - U{i}", "fixture_id": i, "market": "OU", "selection": "Over 1.5",
                "odd": 1.5, "probability": 0.6 + i * 0.05} for i in range(6)]
        sel.append({"fixture": "T0 - U0", "fixture_id": 0, "market": "BTTS", "selection": "Yes", "odd": 1.5, "probability": 0.9})
        pool = build_candidate_pool([sel], [])
        res = search_combinations(pool, target_min=3.0, target_max=3.5, legs_min=2, legs_max=5)
        self.assertTrue(res["results"])
        for combo in res["results"]:
            self.assertLessEqual(combo["legs_count"], 5)
            self.assertTrue(3.0 <= combo["combined_odds"] <= 3.5)
            ids = [leg["fixture_id"] for leg in combo["legs"]]
            self.assertEqual(len(ids), len(set(ids)))  # never two picks from the same match
        chances = [c["hit_chance"] for c in res["results"]]
        self.assertEqual(chances, sorted(chances, reverse=True))


@override_settings(MEDIA_ROOT=MEDIA, TELEGRAM_BOT_TOKEN="", CARD_NUMBER="1111")
class CombinatorFlowTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user("v", "v@example.com", "x")
        VipMember.objects.create(user=self.user)
        self.client.force_authenticate(self.user)
        sel = [
            {"fixture": "A - B", "fixture_id": 1, "market": "MATCH_WINNER", "selection": "A (Home Win)", "odd": 2.0, "probability": 0.55},
            {"fixture": "C - D", "fixture_id": 2, "market": "OU", "selection": "Over 2.5", "odd": 1.6, "probability": 0.62},
            {"fixture": "G - H", "fixture_id": 3, "market": "OU", "selection": "Over 1.5", "odd": 1.25, "probability": 0.8},
        ]
        DailyCheck.objects.filter(package_key="standard_3x").update(body_text="check", is_available=True, selections_json=sel)
        app = AppSettings.get()
        app.checks_date = yerevan_today()
        app.save()
        SelectionCandidate.objects.create(fixture_name="E - F", market="BTTS", selection="Yes", odd=1.6)

    def search(self, tier="combo_x5", legs=3):
        return self.client.post("/api/combinator/search/", {"tier": tier, "legs": legs}, format="json")

    def buy(self, tier="combo_x5"):
        return self.client.post("/api/combinator/orders/", {"tier": tier, "receipt": receipt()}, format="multipart")

    def test_pool_hides_picks(self):
        r = self.client.get("/api/combinator/pool/")
        self.assertEqual(r.data["count"], 4)
        self.assertNotIn("candidates", r.data)
        self.assertEqual([t["price"] for t in r.data["tiers"]], [3000, 5000, 6000, 8000])
        self.assertEqual(r.data["fixtures"], 4)  # the most matches a variant can have today
        self.assertEqual((r.data["unlocked"], r.data["pending"]), ([], []))

    def test_unpaid_search_shows_masked_variants(self):
        r = self.search()
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data["tier"], r.data["price"], r.data["unlocked"]), ("combo_x5", 3000, False))
        offer = r.data["results"][0]
        self.assertNotIn("legs", offer)
        self.assertNotIn("body_text", offer)
        self.assertTrue(4.8 <= offer["combined_odds"] <= 5.3)
        self.assertEqual(self.search("combo_x10").data["results"], [])  # not reachable with this pool
        for bad in ({"tier": "combo_x7", "legs": 3}, {"tier": "combo_x5", "legs": 0}, {"tier": "combo_x5"}):
            self.assertEqual(self.client.post("/api/combinator/search/", bad, format="json").status_code, 400, bad)
        too_many = self.search(legs=5)  # only 4 matches today
        self.assertEqual((too_many.status_code, too_many.json()["fixtures"]), (400, 4))

    def test_exact_number_of_matches_any_tier(self):
        """The number of matches is exact (not "up to"), and any tier can be one match if such odds exist."""
        for legs in (2, 3, 4):
            for v in self.search(legs=legs).data["results"]:
                self.assertEqual(v["legs_count"], legs)
        self.assertEqual(self.search(legs=2).data["results"], [])  # x5 can't be made from two of these picks
        self.assertEqual(self.search("combo_x20", legs=1).data["results"], [])
        SelectionCandidate.objects.create(fixture_name="X - Y", market="MATCH_WINNER", selection="Y (Away Win)", odd=20.0)
        single = self.search("combo_x20", legs=1).data["results"]
        self.assertEqual([(v["legs_count"], v["combined_odds"]) for v in single], [(1, 20.0)])

    def test_open_to_every_logged_in_user(self):
        """The combinator is no longer VIP-only: any signed-in user can search and buy a tier."""
        other = User.objects.create_user("n", "n@example.com", "x")
        self.client.force_authenticate(other)
        self.assertEqual(self.search().status_code, 200)
        self.assertEqual(self.buy().status_code, 201)
        self.client.force_authenticate(None)
        self.assertEqual(self.search().status_code, 401)
        self.assertEqual(self.client.get("/api/combinator/pool/").status_code, 401)

    def test_paying_for_a_tier_opens_all_its_variants(self):
        # a pending package payment must survive a combinator purchase
        Payment.objects.create(user=self.user, package_key="pkg_vip", receipt="x.png", amount=5000)
        r = self.buy()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["body_text"], r.data["status"], r.data["valid_date"]), ("", "pending", yerevan_today()))
        self.assertEqual(self.buy().status_code, 409)  # same tier twice a day
        self.assertEqual(Payment.objects.filter(user=self.user, status="pending").count(), 2)
        pay = Payment.objects.get(package_key="combo_x5")
        self.assertEqual(pay.amount, 3000)
        self.assertEqual(self.client.get("/api/combinator/pool/").data["pending"], ["combo_x5"])
        self.assertFalse(self.search().data["unlocked"])

        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        lst = self.client.get("/api/admin/payments/").data["results"]
        self.assertTrue(any("Կոնստրուկտոր x5" in p["package_label"] for p in lst))
        with mock.patch("apps.commerce.services.notify_user") as notify:
            self.assertEqual(self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "approve"}, format="json").status_code, 200)
        self.assertIn("տարբերակները բացված են", notify.call_args.args[1])

        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/combinator/pool/").data["unlocked"], ["combo_x5"])
        r = self.search()
        self.assertTrue(r.data["unlocked"])
        self.assertGreaterEqual(len(r.data["results"]), 1)
        for v in r.data["results"]:
            self.assertEqual(len(v["legs"]), v["legs_count"])
            self.assertIn("GOALKING", v["body_text"])
        self.assertFalse(self.search("combo_x10").data["unlocked"])  # other tiers stay locked
        self.assertEqual(self.client.get("/api/combinator/orders/").data["results"][0]["status"], "paid")

    def test_admin_gets_everything_free(self):
        admin = User.objects.create_user("boss", "boss@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/combinator/pool/").data["unlocked"], ["combo_x10", "combo_x15", "combo_x20", "combo_x5"])
        self.assertIn("legs", self.search().data["results"][0])
        self.assertEqual(self.buy().status_code, 400)
        self.assertTrue(self.client.get("/api/vip/status/").data["is_vip"])
        mine = self.client.get("/api/checks/mine/").data
        self.assertEqual([c["package_key"] for c in mine["checks"]], ["standard_3x"])

    def test_rejected_payment_rejects_order_and_allows_retry(self):
        self.buy()
        pay = Payment.objects.get(package_key="combo_x5")
        admin = User.objects.create_user("a2", "a2@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "reject"}, format="json")
        self.assertEqual(ComboOrder.objects.get().status, "rejected")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.buy().status_code, 201)


@override_settings(N8N_INTERNAL_KEY="k", PROMOS_PER_UPDATE=0, TELEGRAM_BOT_TOKEN="")
class N8nCombinatorPoolTests(APITestCase):
    def setUp(self):
        user = User.objects.create_user("v", "v@example.com", "x")
        VipMember.objects.create(user=user)
        self.client.force_authenticate(user)

    def post(self, selections):
        return self.client.post(
            "/api/internal/packages/",
            {"packages": [], "combinator_selections": selections},
            format="json",
            HTTP_X_INTERNAL_KEY="k",
        )

    def test_selections_feed_only_the_combinator(self):
        picks = [
            {"fixture": "A - B", "fixture_id": 11, "market": "OU", "selection": "Over 1.5", "odd": 1.3, "probability": 0.8},
            {"fixture": "C - D", "fixture_id": 12, "market": "BTTS", "selection": "Yes", "odd": 1.9, "probability": 0.6},
            {"fixture": "bad", "market": "OU", "selection": "Over", "odd": "x"},
        ]
        r = self.post(picks)
        self.assertEqual(r.data["combinator_pool"], 2)
        self.assertEqual(r.data["available"], 0)  # no check was created from them
        self.assertFalse(DailyCheck.objects.filter(is_available=True).exists())
        # a later run merges (keeps earlier picks so found offers stay buyable) and refreshes odds
        self.post([{**picks[1], "odd": 2.0}, {"fixture": "E - F", "fixture_id": 13, "market": "OU", "selection": "Under 3.5", "odd": 1.5}])
        self.assertEqual(self.client.get("/api/combinator/pool/").data["count"], 3)
        pool = {c["fixture_id"]: c for c in current_pool()}
        self.assertEqual(pool["12"]["odd"], 2.0)

        # picks of a match that has already started are not offered
        FixtureCache.objects.create(
            api_fixture_id=11, home_team_name="A", away_team_name="B", kickoff=timezone.now() - timedelta(minutes=5)
        )
        self.assertEqual(self.client.get("/api/combinator/pool/").data["count"], 2)

        r = self.client.post("/api/combinator/search/", {"tier": "combo_x5", "legs": 2}, format="json")
        self.assertEqual(r.status_code, 200, r.data)

    def test_invalid_payload(self):
        r = self.client.post(
            "/api/internal/packages/", {"packages": [], "combinator_selections": "x"}, format="json", HTTP_X_INTERNAL_KEY="k"
        )
        self.assertEqual(r.status_code, 400)
