from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.checks.services.time import yerevan_today
from apps.games.models import FixtureCache, TeamFormSnapshot

YEREVAN = ZoneInfo("Asia/Yerevan")


def api_fixture(fid, home, away, hid, aid, status="NS", league=(39, "Premier League")):
    noon = datetime.fromisoformat(yerevan_today()).replace(hour=12, tzinfo=YEREVAN)
    return {
        "fixture": {"id": fid, "date": (noon + timedelta(minutes=fid)).isoformat(), "status": {"short": status}},
        "league": {"id": league[0], "name": league[1]},
        "teams": {"home": {"id": hid, "name": home}, "away": {"id": aid, "name": away}},
        "goals": {"home": None, "away": None},
    }


def last_matches(team_id, last=5, venue=None):
    # team 1 wins everything, others draw
    out = []
    for i in range(last):
        goals = {"home": 2, "away": 0} if team_id == 1 else {"home": 1, "away": 1}
        out.append({
            "fixture": {"date": f"2026-01-0{i + 1}"},
            "teams": {"home": {"id": team_id, "name": "X"}, "away": {"id": 999, "name": "Y"}},
            "goals": goals,
        })
    return out


class GamesWithoutProviderTests(APITestCase):
    @override_settings(API_FOOTBALL_KEY="")
    def test_empty_list_reports_unconfigured_provider(self):
        r = self.client.get("/api/games/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["provider_configured"])
        self.assertEqual(r.data["results"], [])
        self.assertEqual(self.client.get("/api/games/123/").status_code, 503)

    def test_query_validation(self):
        for qs in ("date=bad", "league=abc", "status=nope", "min_win_pct=200", "sort=random"):
            self.assertEqual(self.client.get(f"/api/games/?{qs}").status_code, 400, qs)
        self.assertEqual(self.client.get("/api/games/1/?last_n=500").status_code, 400)


@override_settings(API_FOOTBALL_KEY="test-key", FORM_STATS_TTL_MINUTES=60)
class GamesWithProviderTests(APITestCase):
    def setUp(self):
        fixtures = [
            api_fixture(1, "Alpha", "Beta", 1, 2),
            api_fixture(2, "Gamma", "Delta", 3, 4, status="1H", league=(140, "La Liga")),
            api_fixture(3, "Other", "Club", 5, 6, league=(9999, "Random Cup")),  # not a site league
        ]
        p1 = mock.patch("apps.games.tasks.fixtures_by_date", return_value=fixtures)
        p2 = mock.patch("apps.games.form_stats.team_last_fixtures", side_effect=last_matches)
        self.fixtures_mock = p1.start()
        self.form_mock = p2.start()
        self.addCleanup(p1.stop)
        self.addCleanup(p2.stop)

    def test_sync_filter_sort_paginate(self):
        r = self.client.get("/api/games/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["count"], 2)
        self.assertEqual(FixtureCache.objects.count(), 3)
        # only the bot's leagues, in the configured order (Premier League before La Liga)
        self.assertEqual([lg["name"] for lg in r.data["leagues"]], ["Premier League", "La Liga"])
        self.assertEqual(self.client.get("/api/games/?q=Other").data["count"], 0)
        self.assertEqual(self.client.get("/api/summary/").data["games_today"], 2)
        first = r.data["results"][0]
        self.assertEqual(first["home_form"]["win_pct"], 100.0)
        self.assertEqual(first["form_diff"], 100.0)

        # Form persisted in DB: no new API calls for a second request.
        calls = self.form_mock.call_count
        self.client.get("/api/games/?sort=form_diff")
        self.assertEqual(self.form_mock.call_count, calls)
        self.assertEqual(TeamFormSnapshot.objects.count(), 4)

        self.assertEqual(self.client.get("/api/games/?status=live").data["count"], 1)
        self.assertEqual(self.client.get("/api/games/?league=140").data["count"], 1)
        self.assertEqual(self.client.get("/api/games/?q=alp").data["count"], 1)
        self.assertEqual(self.client.get("/api/games/?min_win_pct=50").data["count"], 1)
        page = self.client.get("/api/games/?page_size=1&page=2").data
        self.assertEqual(page["total_pages"], 2)
        self.assertEqual(len(page["results"]), 1)

    def test_detail_uses_cache_when_live_call_fails(self):
        from apps.games.football_api import FootballApiError

        self.client.get("/api/games/")
        with mock.patch("apps.games.views.fixture_by_id", side_effect=FootballApiError("down")), mock.patch(
            "apps.games.views.head_to_head", return_value=[]
        ):
            r = self.client.get("/api/games/1/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["home"], "Alpha")
        self.assertEqual(r.data["home_form"]["wins"], 5)
