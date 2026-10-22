import io
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.analysis.models import AnalysisOrder, MatchAnalysis
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment
from apps.games.models import FixtureCache

User = get_user_model()
MEDIA = tempfile.mkdtemp()

REPORT = {
    "xg": [1.6, 1.1],
    "p1x2": [0.48, 0.27, 0.25],
    "btts": 0.55,
    "goals": [[2.5, 0.52]],
    "corners": {"exp": 10.2, "home": 5.5, "away": 4.7, "lines": [[9.5, 0.56]]},
    "cards": {"exp": 4.1, "home": 2.0, "away": 2.1, "lines": [[3.5, 0.6]]},
}


def item(fid=1, home="Barcelona", away="Real Madrid", report=REPORT):
    return {"fixture_id": fid, "league_id": 140, "home": home, "away": away, "report": report,
            "picks": [{"market": "OU", "selection": "Over 2.5", "odd": 1.7, "probability": 0.55}]}


def receipt():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, "PNG")
    return SimpleUploadedFile("r.png", buf.getvalue(), content_type="image/png")


@override_settings(N8N_INTERNAL_KEY="k", PROMOS_PER_UPDATE=0, TELEGRAM_BOT_TOKEN="", MEDIA_ROOT=MEDIA)
class MatchAnalysisTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user("fan", "fan@example.com", "x")
        self.admin = User.objects.create_user("boss", "boss@example.com", "x", is_staff=True)

    def post(self, analyses):
        return self.client.post(
            "/api/internal/packages/", {"packages": [], "match_analyses": analyses}, format="json", HTTP_X_INTERNAL_KEY="k"
        )

    def test_webhook_stores_once_per_day(self):
        r = self.post([item(), item(2, "A", "B"), {"fixture_id": "x", "report": {}}, item(3, report="bad")])
        self.assertEqual(r.data["match_analyses"], 2)
        # a later run must not change what people may have bought
        self.post([item(report={**REPORT, "btts": 0.9})])
        self.assertEqual(MatchAnalysis.objects.get(fixture_id=1).report["btts"], 0.55)
        self.assertEqual(MatchAnalysis.objects.count(), 2)

    def test_buy_approve_open(self):
        self.post([item()])
        a = MatchAnalysis.objects.get()
        lst = self.client.get("/api/analysis/").data
        self.assertEqual((lst["price"], lst["results"][0]["access"], lst["results"][0]["league"]), (1000, "locked", "La Liga"))
        self.assertNotIn("report", lst["results"][0])

        self.client.force_authenticate(self.user)
        self.assertNotIn("report", self.client.get(f"/api/analysis/{a.id}/").data)
        r = self.client.post(f"/api/analysis/{a.id}/buy/", {"receipt": receipt()}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.client.post(f"/api/analysis/{a.id}/buy/", {"receipt": receipt()}, format="multipart").status_code, 409)
        pay = Payment.objects.get(package_key="match_analysis")
        self.assertEqual(pay.amount, 1000)

        self.client.force_authenticate(self.admin)
        with mock.patch("apps.commerce.services.notify_user") as notify:
            r = self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "approve"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn("Barcelona - Real Madrid", notify.call_args.args[1])

        self.client.force_authenticate(self.user)
        detail = self.client.get(f"/api/analysis/{a.id}/").data
        self.assertEqual(detail["access"], "open")
        self.assertEqual(detail["report"]["corners"]["exp"], 10.2)
        self.assertEqual(len(detail["picks"]), 1)
        self.assertEqual(self.client.get("/api/analysis/mine/").data["results"][0]["status"], "paid")

    def test_several_analyses_pending_side_by_side_and_reject(self):
        self.post([item(), item(2, "A", "B")])
        self.client.force_authenticate(self.user)
        for a in MatchAnalysis.objects.all():
            self.assertEqual(self.client.post(f"/api/analysis/{a.id}/buy/", {"receipt": receipt()}, format="multipart").status_code, 201)
        self.assertEqual(Payment.objects.filter(status="pending").count(), 2)
        pay = Payment.objects.first()
        self.client.force_authenticate(self.admin)
        self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "reject"}, format="json")
        self.assertEqual(AnalysisOrder.objects.get(payment=pay).status, "rejected")

    def test_admin_free_and_started_match(self):
        self.post([item()])
        a = MatchAnalysis.objects.get()
        self.client.force_authenticate(self.admin)
        self.assertIn("report", self.client.get(f"/api/analysis/{a.id}/").data)
        self.assertEqual(self.client.post(f"/api/analysis/{a.id}/buy/", {"receipt": receipt()}, format="multipart").status_code, 400)
        FixtureCache.objects.create(api_fixture_id=1, home_team_name="Barcelona", away_team_name="Real Madrid",
                                    kickoff=timezone.now() - timedelta(minutes=1))
        self.client.force_authenticate(self.user)
        self.assertTrue(self.client.get("/api/analysis/").data["results"][0]["started"])
        r = self.client.post(f"/api/analysis/{a.id}/buy/", {"receipt": receipt()}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(MatchAnalysis.objects.get().date, yerevan_today())
