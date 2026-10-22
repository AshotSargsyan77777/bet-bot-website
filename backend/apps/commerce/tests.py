import io
import shutil
import tempfile
import threading
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, connection
from django.test import TransactionTestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment, PromoCode, Subscription, VipMember
from apps.commerce.services import redeem_promo

User = get_user_model()
MEDIA = tempfile.mkdtemp()


def image_file(name="receipt.png", fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buf, fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f"image/{fmt.lower()}")


def make_ready(key, text="⚽ GOALKING ՉԵԿ\nreal check"):
    DailyCheck.objects.filter(package_key=key).update(body_text=text, is_available=True)
    app = AppSettings.get()
    app.checks_date = yerevan_today()
    app.save()


@override_settings(MEDIA_ROOT=MEDIA)
class PaymentFlowTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user("buyer", "b@example.com", "x")
        self.admin = User.objects.create_user("boss", "boss@example.com", "x", is_staff=True)

    def pay(self, key, f=None):
        return self.client.post("/api/payments/", {"package_key": key, "receipt": f or image_file()}, format="multipart")

    def test_cannot_buy_unready_or_invalid_package(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.pay("standard_3x").status_code, 400)
        self.assertEqual(self.pay("promo_5x").status_code, 400)
        r = self.client.post("/api/payments/", {"package_key": "pkg_vip"}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("receipt", r.data["fields"])
        bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
        self.assertEqual(self.pay("pkg_vip", bad).status_code, 400)

    def test_full_purchase_and_approval(self):
        make_ready("standard_3x")
        self.client.force_authenticate(self.user)
        r = self.pay("standard_3x")
        self.assertEqual(r.status_code, 201, r.data)
        # Second receipt replaces the first pending one.
        self.assertEqual(self.pay("standard_3x").status_code, 201)
        self.assertEqual(Payment.objects.filter(user=self.user, status="pending").count(), 1)
        pending = Payment.objects.get(user=self.user, status="pending")

        # Receipt is not reachable by regular users.
        self.assertEqual(self.client.get(f"/api/admin/payments/{pending.id}/receipt/").status_code, 403)
        self.assertEqual(self.client.get("/api/checks/mine/").data, {"active": False})

        self.client.force_authenticate(self.admin)
        lst = self.client.get("/api/admin/payments/")
        self.assertEqual(lst.data["count"], 1)
        receipt = self.client.get(lst.data["results"][0]["receipt_url"])
        self.assertEqual(receipt.status_code, 200)
        self.assertEqual(receipt["Content-Type"], "image/png")

        r = self.client.post("/api/admin/payments/", {"payment_id": pending.id, "action": "approve"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        # Approving twice is rejected.
        r = self.client.post("/api/admin/payments/", {"payment_id": pending.id, "action": "approve"}, format="json")
        self.assertEqual(r.status_code, 409)

        self.client.force_authenticate(self.user)
        mine = self.client.get("/api/checks/mine/")
        self.assertTrue(mine.data["active"])
        self.assertIn("real check", mine.data["text"])
        status = self.client.get("/api/status/").data
        self.assertTrue(status["has_active_check"])
        self.assertEqual(self.client.get("/api/payments/").data["results"][0]["status"], "approved")

    def test_vip_purchase_reveals_link_only_to_member(self):
        with self.settings(VIP_CHANNEL_LINK="https://t.me/+secret"):
            self.client.force_authenticate(self.user)
            self.assertEqual(self.client.get("/api/vip/status/").data["link"], "")
            self.assertEqual(self.client.post("/api/combinator/search/", {}, format="json").status_code, 403)
            self.assertEqual(self.pay("pkg_vip").status_code, 201)
            payment = Payment.objects.get(user=self.user)
            self.client.force_authenticate(self.admin)
            self.client.post("/api/admin/payments/", {"payment_id": payment.id, "action": "approve"}, format="json")
            self.client.force_authenticate(self.user)
            vip = self.client.get("/api/vip/status/").data
            self.assertTrue(vip["is_vip"])
            self.assertEqual(vip["link"], "https://t.me/+secret")

    def test_reject_and_admin_validation(self):
        make_ready("standard_5x")
        self.client.force_authenticate(self.user)
        self.pay("standard_5x")
        payment = Payment.objects.get(user=self.user)
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post("/api/admin/payments/", {"payment_id": "abc", "action": "approve"}, format="json").status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/api/admin/payments/", {"payment_id": 999, "action": "approve"}, format="json").status_code,
            404,
        )
        r = self.client.post("/api/admin/payments/", {"payment_id": payment.id, "action": "reject"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get("/api/admin/payments/?status=rejected").data["count"], 1)
        self.assertFalse(Subscription.objects.exists())

    def test_one_pending_payment_constraint(self):
        Payment.objects.create(user=self.user, package_key="pkg_vip", receipt="r.png")
        with self.assertRaises(IntegrityError):
            Payment.objects.create(user=self.user, package_key="pkg_vip", receipt="r2.png")


class PromoTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("p", "p@example.com", "x")
        self.admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)

    def test_generate_and_redeem(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post("/api/admin/promo/", {"n": "abc"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/admin/promo/", {"n": 500}, format="json").status_code, 400)
        r = self.client.post("/api/admin/promo/", {"n": 3}, format="json")
        self.assertEqual(r.status_code, 201)
        code = r.data["codes"][0]
        self.assertEqual(self.client.get("/api/admin/promo/").data["free"], 3)

        self.client.force_authenticate(self.user)
        r = self.client.post("/api/promo/redeem/", {"code": code}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "not_ready")

        make_ready("promo_5x", "promo check")
        self.assertEqual(self.client.post("/api/promo/redeem/", {"code": "ZZZZZ"}, format="json").data["code"], "invalid")
        r = self.client.post("/api/promo/redeem/", {"code": f" {code.lower()} "}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(self.client.get("/api/checks/mine/").data["from_promo"])

        other = User.objects.create_user("o", "o@example.com", "x")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post("/api/promo/redeem/", {"code": code}, format="json").data["code"], "used")


@override_settings(MEDIA_ROOT=MEDIA)
class PromoConcurrencyTests(TransactionTestCase):
    """Two users redeeming the same code at the same moment: exactly one must win."""

    def test_concurrent_redeem(self):
        if connection.vendor != "postgresql":
            self.skipTest("row locking requires PostgreSQL")
        from django.core.management import call_command

        call_command("migrate", "checks", verbosity=0)
        DailyCheck.ensure_defaults()
        make_ready("promo_5x", "promo check")
        PromoCode.objects.create(code="RACE1", created_date=yerevan_today())
        users = [User.objects.create_user(f"r{i}", f"r{i}@example.com", "x") for i in range(4)]
        results = []
        barrier = threading.Barrier(len(users))

        def worker(u):
            from django.db import connection as conn

            barrier.wait()
            try:
                results.append(redeem_promo(u, "RACE1")[0])
            finally:
                conn.close()

        threads = [threading.Thread(target=worker, args=(u,)) for u in users]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results.count(True), 1)
        self.assertEqual(Subscription.objects.count(), 1)


class CandidatesAndStatsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(self.admin)

    def test_candidate_crud(self):
        bad = {"fixture_name": "A - B", "market": "OU", "selection": "Over 2.5", "odd": 0.9}
        self.assertEqual(self.client.post("/api/admin/candidates/", bad, format="json").status_code, 400)
        ok = {**bad, "odd": 1.85, "reasons": ["xG total 3.1"]}
        r = self.client.post("/api/admin/candidates/", ok, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        cid = r.data["id"]
        self.assertEqual(self.client.get("/api/admin/candidates/").data["count"], 1)
        r = self.client.patch(f"/api/admin/candidates/{cid}/", {"active": False}, format="json")
        self.assertFalse(r.data["active"])
        self.assertEqual(self.client.delete(f"/api/admin/candidates/{cid}/").status_code, 204)

    def test_stats(self):
        VipMember.objects.create(user=self.admin)
        r = self.client.get("/api/admin/stats/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["vip_members"], 1)
        self.assertIn("pending_payments", r.data)

    def test_anonymous_cannot_access_admin(self):
        anon = APIClient()
        for url in ("/api/admin/payments/", "/api/admin/promo/", "/api/admin/support/", "/api/admin/candidates/"):
            self.assertEqual(anon.get(url).status_code, 401, url)


class RevenueTests(APITestCase):
    def test_revenue_by_package_and_day(self):
        from django.utils import timezone

        admin = User.objects.create_user("rev", "rev@example.com", "x", is_staff=True)
        buyer = User.objects.create_user("rb", "rb@example.com", "x")
        now = timezone.now()
        Payment.objects.create(user=buyer, package_key="standard_3x", receipt="a.png", amount=2000,
                               status="approved", reviewed_at=now)
        Payment.objects.create(user=buyer, package_key="pkg_vip", receipt="b.png", amount=5000,
                               status="approved", reviewed_at=now - timedelta(days=2))
        Payment.objects.create(user=buyer, package_key="pkg_vip", receipt="c.png", amount=5000, status="rejected")
        self.client.force_authenticate(buyer)
        self.assertEqual(self.client.get("/api/admin/revenue/").status_code, 403)
        self.client.force_authenticate(admin)
        r = self.client.get("/api/admin/revenue/?days=7").data
        self.assertEqual((r["total_amount"], r["total_count"], r["today_amount"]), (7000, 2, 2000))
        self.assertEqual(r["by_package"][0]["key"], "pkg_vip")
        self.assertEqual(len(r["by_day"]), 7)
        self.assertEqual(sum(d["amount"] for d in r["by_day"]), 7000)

    @override_settings(MEDIA_ROOT=MEDIA)
    def test_payment_amount_saved(self):
        buyer = User.objects.create_user("amt", "amt@example.com", "x")
        self.client.force_authenticate(buyer)
        self.client.post("/api/payments/", {"package_key": "pkg_vip", "receipt": image_file()}, format="multipart")
        self.assertEqual(Payment.objects.get(user=buyer).amount, 5000)
