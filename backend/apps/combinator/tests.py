import io
import shutil
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today
from apps.combinator.models import ComboOrder
from apps.combinator.search import build_candidate_pool, search_combinations
from apps.commerce.models import Payment, SelectionCandidate, VipMember

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

    def search(self, lo=4.8, hi=5.3, max_legs=7):
        return self.client.post("/api/combinator/search/", {"target_odds_min": lo, "target_odds_max": hi, "max_legs": max_legs}, format="json")

    def test_pool_hides_picks(self):
        r = self.client.get("/api/combinator/pool/")
        self.assertEqual(r.data["count"], 4)
        self.assertNotIn("candidates", r.data)
        self.assertEqual([t["price"] for t in r.data["tiers"]], [3000, 5000, 6000, 8000])

    def test_search_returns_masked_offers_with_price(self):
        r = self.search()
        self.assertEqual(r.status_code, 200, r.data)
        offer = r.data["results"][0]
        self.assertEqual((offer["tier"], offer["price"]), ("combo_x5", 3000))
        self.assertNotIn("legs", offer)
        self.assertTrue(4.8 <= offer["combined_odds"] <= 5.3)
        self.assertEqual(self.search(9.5, 10.5).data["results"], [])  # not reachable with this pool
        for bad in ({"target_odds_min": 6, "target_odds_max": 5}, {"target_odds_min": 2, "target_odds_max": 30},
                    {"target_odds_min": 2, "target_odds_max": 5, "max_legs": 1}):
            self.assertEqual(self.client.post("/api/combinator/search/", bad, format="json").status_code, 400, bad)

    def test_non_vip_forbidden(self):
        other = User.objects.create_user("n", "n@example.com", "x")
        self.client.force_authenticate(other)
        self.assertEqual(self.search().status_code, 403)
        self.assertEqual(self.client.get("/api/combinator/orders/").status_code, 403)

    def test_buy_approve_unlocks_legs(self):
        offer = self.search().data["results"][0]
        # a pending package payment must survive a combinator purchase
        Payment.objects.create(user=self.user, package_key="pkg_vip", receipt="x.png", amount=5000)
        r = self.client.post("/api/combinator/orders/", {"token": offer["token"], "receipt": receipt()}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["legs"], r.data["body_text"], r.data["status"]), ([], "", "pending"))
        self.assertEqual(Payment.objects.filter(user=self.user, status="pending").count(), 2)
        pay = Payment.objects.get(package_key="combo_x5")
        self.assertEqual(pay.amount, 3000)

        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        lst = self.client.get("/api/admin/payments/").data["results"]
        self.assertTrue(any("Կոնստրուկտոր x5" in p["package_label"] for p in lst))
        with mock.patch("apps.commerce.services.notify_user") as notify:
            self.assertEqual(self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "approve"}, format="json").status_code, 200)
        self.assertIn("GOALKING", notify.call_args.args[1])

        self.client.force_authenticate(self.user)
        order = self.client.get("/api/combinator/orders/").data["results"][0]
        self.assertEqual(order["status"], "paid")
        self.assertEqual(len(order["legs"]), order["legs_count"])
        self.assertIn("GOALKING", order["body_text"])

    def test_reject_and_token_checks(self):
        offer = self.search().data["results"][0]
        self.assertEqual(self.client.post("/api/combinator/orders/", {"token": offer["token"] + "x", "receipt": receipt()}, format="multipart").status_code, 400)
        other = User.objects.create_user("o", "o@example.com", "x")
        VipMember.objects.create(user=other)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post("/api/combinator/orders/", {"token": offer["token"], "receipt": receipt()}, format="multipart").status_code, 400)
        self.client.force_authenticate(self.user)
        # picks changed after the search → stale
        DailyCheck.objects.filter(package_key="standard_3x").update(selections_json=[])
        SelectionCandidate.objects.all().delete()
        self.assertEqual(self.client.post("/api/combinator/orders/", {"token": offer["token"], "receipt": receipt()}, format="multipart").status_code, 409)
        self.assertFalse(ComboOrder.objects.exists())

    def test_rejected_payment_rejects_order(self):
        offer = self.search().data["results"][0]
        self.client.post("/api/combinator/orders/", {"token": offer["token"], "receipt": receipt()}, format="multipart")
        pay = Payment.objects.get(package_key="combo_x5")
        admin = User.objects.create_user("a2", "a2@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "reject"}, format="json")
        self.assertEqual(ComboOrder.objects.get().status, "rejected")
