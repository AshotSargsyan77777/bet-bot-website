from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.checks.models import AppSettings, CheckRecord, DailyCheck
from apps.checks.services.settlement import combine, evaluate_leg
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Subscription

User = get_user_model()


def fx(gh, ga, ht=(0, 0), status="FT", fid=1, days_ago=1):
    return {
        "fixture": {"id": fid, "status": {"short": status}, "date": (timezone.now() - timedelta(days=days_ago)).isoformat()},
        "teams": {"home": {"id": 10, "name": "Home FC"}, "away": {"id": 20, "name": "Away FC"}},
        "goals": {"home": gh, "away": ga},
        "score": {"fulltime": {"home": gh, "away": ga}, "halftime": {"home": ht[0], "away": ht[1]}},
    }


def leg(market, selection):
    return {"fixture": "Home FC - Away FC", "market": market, "selection": selection, "odd": 1.5}


STATS = {"corners": 11, "home_corners": 7, "away_corners": 4, "cards": 5}


class EvaluateLegTests(SimpleTestCase):
    def ev(self, market, selection, f):
        return evaluate_leg(leg(market, selection), f, lambda _fx: STATS)

    def test_markets(self):
        f = fx(2, 1, ht=(1, 0))
        cases = [
            ("MATCH_WINNER", "Home FC (Home Win)", "won"), ("MATCH_WINNER", "Away FC (Away Win)", "lost"),
            ("DOUBLE_CHANCE", "Home FC or Draw", "won"), ("DOUBLE_CHANCE", "Away FC or Draw", "lost"),
            ("DNB", "Draw No Bet — Home FC", "won"), ("BTTS", "Both Teams To Score - Yes", "won"),
            ("BTTS", "Both Teams To Score - No", "lost"), ("OU", "Over 2.5", "won"), ("OU", "Under 2.5", "lost"),
            ("OU", "Over 3", "void"), ("TEAM_TOTAL_HOME", "Home FC Over 1.5 Goals", "won"),
            ("TEAM_TOTAL_AWAY", "Away FC Under 0.5 Goals", "lost"), ("OU_1H", "1st Half Over 0.5", "won"),
            ("OU_1H", "1st Half Under 1", "void"), ("CLEAN_SHEET_HOME", "Home FC Clean Sheet - No", "won"),
            ("WIN_TO_NIL_HOME", "Home FC Win To Nil - Yes", "lost"), ("CORNERS_OU", "Corners Over 9.5", "won"),
            ("CORNERS_HOME", "Home FC Corners Under 6.5", "lost"), ("CORNERS_AWAY", "Away FC Corners Over 3.5", "won"),
            ("CARDS_OU", "Cards Under 4.5", "lost"), ("ODD_EVEN", "Odd", "won"),
        ]
        for market, selection, expected in cases:
            self.assertEqual(self.ev(market, selection, f), expected, (market, selection))

    def test_draw_and_status_rules(self):
        self.assertEqual(self.ev("DNB", "Draw No Bet — Home FC", fx(1, 1)), "void")
        self.assertEqual(self.ev("OU", "Over 2.5", fx(None, None, status="NS")), "pending")
        self.assertEqual(self.ev("OU", "Over 2.5", fx(1, 1, status="2H")), "pending")
        self.assertEqual(self.ev("OU", "Over 2.5", fx(0, 0, status="CANC")), "void")
        self.assertEqual(self.ev("OU", "Over 2.5", fx(0, 0, status="PST", days_ago=0)), "pending")
        self.assertEqual(self.ev("OU", "Over 2.5", fx(0, 0, status="PST", days_ago=3)), "void")
        no_stats = evaluate_leg(leg("CORNERS_OU", "Corners Over 9.5"), fx(1, 0, days_ago=0), lambda _f: None)
        self.assertEqual(no_stats, "pending")
        self.assertEqual(evaluate_leg(leg("CORNERS_OU", "Corners Over 9.5"), fx(1, 0, days_ago=5), lambda _f: None), "void")
        self.assertEqual(evaluate_leg(leg("OU", "Over 2.5"), None, lambda _f: None), "pending")

    def test_combine(self):
        self.assertEqual(combine(["won", "won"]), "won")
        self.assertEqual(combine(["won", "void"]), "won")
        self.assertEqual(combine(["void", "void"]), "void")
        self.assertEqual(combine(["won", "pending"]), "pending")
        self.assertEqual(combine(["pending", "lost"]), "lost")


PKG = {
    "tier": "standard", "package": "3x", "available": True, "combined_odds": 3.2,
    "selections": [
        {"fixture": "Home FC - Away FC", "fixture_id": 1, "market": "OU", "selection": "Over 2.5", "odd": 1.6},
        {"fixture": "C - D", "fixture_id": 2, "market": "BTTS", "selection": "Both Teams To Score - Yes", "odd": 2.0},
    ],
}


@override_settings(N8N_INTERNAL_KEY="k", PROMOS_PER_UPDATE=0, API_FOOTBALL_KEY="x", TELEGRAM_BOT_TOKEN="")
class RecordsAndHistoryTests(APITestCase):
    def post(self, packages):
        return self.client.post("/api/internal/packages/", {"packages": packages}, format="json", HTTP_X_INTERNAL_KEY="k")

    def test_versions_and_history_visibility(self):
        self.post([PKG])
        self.post([PKG])  # hourly re-post with the same picks: no duplicate
        self.assertEqual(CheckRecord.objects.count(), 1)
        first = CheckRecord.objects.get()
        self.assertEqual(DailyCheck.objects.get(package_key="standard_3x").current_record, first)

        # a user buys the first version
        user = User.objects.create_user("buyer", "b@example.com", "x")
        Subscription.objects.create(user=user, package_key="standard_3x", valid_date=yerevan_today(), record=first)

        changed = {**PKG, "selections": [{**PKG["selections"][0], "selection": "Over 1.5"}, PKG["selections"][1]]}
        self.post([changed])
        third = {**PKG, "selections": [{**PKG["selections"][0], "selection": "Under 3.5"}, PKG["selections"][1]]}
        self.post([third])
        self.assertEqual(CheckRecord.objects.count(), 3)
        self.assertEqual(CheckRecord.objects.filter(is_final=True).count(), 1)

        # today's checks are not public
        self.assertEqual(self.client.get("/api/checks/history/").data["count"], 0)
        yesterday = (date.fromisoformat(yerevan_today()) - timedelta(days=1)).isoformat()
        CheckRecord.objects.update(date=yesterday)
        hist = self.client.get("/api/checks/history/").data
        # final version + the version someone bought; the unsold intermediate one is hidden
        self.assertEqual(hist["count"], 2)
        self.assertEqual(len(hist["results"][0]["legs"]), 2)

    def test_settlement_and_stats(self):
        self.post([PKG])
        record = CheckRecord.objects.get()
        yesterday = (date.fromisoformat(yerevan_today()) - timedelta(days=1)).isoformat()
        CheckRecord.objects.update(date=yesterday)
        fixtures = [fx(2, 1, fid=1), {**fx(1, 0, fid=2)}]
        with mock.patch("apps.checks.services.settlement.fixtures_by_ids", return_value=fixtures) as m:
            self.assertEqual(self.client.post("/api/internal/settle/", HTTP_X_INTERNAL_KEY="bad").status_code, 401)
            r = self.client.post("/api/internal/settle/", HTTP_X_INTERNAL_KEY="k")
        self.assertEqual(r.data["settled"], 1)
        m.assert_called_once()
        record.refresh_from_db()
        self.assertEqual(record.status, "lost")  # C - D ended 1-0, BTTS Yes lost
        self.assertEqual([l["result"] for l in record.legs_result], ["won", "lost"])

        stats = self.client.get("/api/checks/history/stats/").data
        self.assertEqual((stats["won"], stats["lost"], stats["win_rate"]), (0, 1, 0.0))
        self.assertEqual(self.client.get("/api/summary/").data["results_30d"]["settled"], 1)

        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        r = self.client.patch(f"/api/admin/records/{record.pk}/", {"status": "won"}, format="json")
        self.assertEqual(r.data["status"], "won")
        record.refresh_from_db()
        self.assertTrue(record.settled_manually)
        # manually settled records are not overwritten by automatic settlement
        CheckRecord.objects.filter(pk=record.pk).update(status="pending")
        with mock.patch("apps.checks.services.settlement.fixtures_by_ids", return_value=fixtures):
            self.assertEqual(self.client.post("/api/admin/records/").data["checked"], 0)
        self.assertEqual(self.client.get("/api/admin/records/?status=pending").data["count"], 1)

    def test_admin_manual_check_creates_record(self):
        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)
        self.client.force_authenticate(admin)
        self.client.patch("/api/admin/checks/", {"package_key": "standard_10x", "body_text": "Manual"}, format="json")
        rec = CheckRecord.objects.get(package_key="standard_10x")
        self.assertEqual(rec.body_text, "Manual")
        self.assertEqual(AppSettings.get().checks_date, rec.date)
