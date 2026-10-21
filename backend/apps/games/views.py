from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.checks.services.time import yerevan_today
from apps.games.football_api import FootballApiError, fixture_by_id, head_to_head
from apps.games.form_stats import aggregate_form
from apps.games.models import FixtureCache
from apps.games.tasks import sync_fixtures_for_date


class GameListView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        date = request.query_params.get("date") or yerevan_today()
        q = request.query_params.get("q", "").strip()
        league_id = request.query_params.get("league")
        status_f = request.query_params.get("status")
        min_win_pct = request.query_params.get("min_win_pct")
        sort = request.query_params.get("sort", "kickoff")

        if not FixtureCache.objects.filter(kickoff__date=date).exists():
            try:
                sync_fixtures_for_date(date)
            except Exception:
                pass

        qs = FixtureCache.objects.filter(kickoff__date=date)
        if league_id:
            qs = qs.filter(league_id=int(league_id))
        if status_f == "live":
            qs = qs.filter(status_short__in=["1H", "2H", "HT", "ET", "P", "LIVE"])
        elif status_f == "upcoming":
            qs = qs.exclude(status_short__in=["FT", "AET", "PEN", "CANC", "ABD"])
        if q:
            qs = qs.filter(Q(home_team_name__icontains=q) | Q(away_team_name__icontains=q))

        items = []
        for f in qs:
            home_form = None
            away_form = None
            if f.home_team_id and f.away_team_id:
                try:
                    venue = request.query_params.get("form_venue", "all")
                    home_form = aggregate_form(f.home_team_id, f.home_team_name, 5, venue)
                    away_form = aggregate_form(f.away_team_id, f.away_team_name, 5, venue)
                except FootballApiError:
                    pass

            form_diff = None
            if home_form and away_form:
                form_diff = home_form["win_pct"] - away_form["win_pct"]

            if min_win_pct:
                try:
                    mw = float(min_win_pct)
                    if home_form and home_form["win_pct"] < mw:
                        continue
                except ValueError:
                    pass

            items.append(
                {
                    "id": f.api_fixture_id,
                    "league": f.league_name,
                    "league_id": f.league_id,
                    "home": f.home_team_name,
                    "away": f.away_team_name,
                    "kickoff": f.kickoff,
                    "status": f.status_short,
                    "score": [f.goals_home, f.goals_away],
                    "home_form": home_form,
                    "away_form": away_form,
                    "form_diff": form_diff,
                }
            )

        if sort == "form_diff" and items:
            items.sort(key=lambda x: x.get("form_diff") or 0, reverse=True)
        elif sort == "kickoff":
            items.sort(key=lambda x: x["kickoff"])

        return Response({"date": date, "count": len(items), "games": items})


class GameDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request, fixture_id: int):
        cached = FixtureCache.objects.filter(api_fixture_id=fixture_id).first()
        venue_home = request.query_params.get("home_venue", "all")
        venue_away = request.query_params.get("away_venue", "all")
        last_n = int(request.query_params.get("last_n", 5))

        live = None
        try:
            live = fixture_by_id(fixture_id)
        except FootballApiError:
            live = cached.raw_json if cached else None

        if not cached and not live:
            return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)

        home_id = cached.home_team_id if cached else (live.get("teams") or {}).get("home", {}).get("id")
        away_id = cached.away_team_id if cached else (live.get("teams") or {}).get("away", {}).get("id")
        home_name = cached.home_team_name if cached else (live.get("teams") or {}).get("home", {}).get("name")
        away_name = cached.away_team_name if cached else (live.get("teams") or {}).get("away", {}).get("name")

        home_form = away_form = h2h = None
        try:
            if home_id:
                home_form = aggregate_form(home_id, home_name or "", last_n, venue_home)
            if away_id:
                away_form = aggregate_form(away_id, away_name or "", last_n, venue_away)
            if home_id and away_id:
                h2h_raw = head_to_head(home_id, away_id, last_n)
                h2h = [
                    {
                        "date": (m.get("fixture") or {}).get("date"),
                        "home": (m.get("teams") or {}).get("home", {}).get("name"),
                        "away": (m.get("teams") or {}).get("away", {}).get("name"),
                        "goals": m.get("goals"),
                    }
                    for m in h2h_raw
                ]
        except FootballApiError as e:
            return Response({"error": str(e)}, status=503)

        return Response(
            {
                "fixture_id": fixture_id,
                "cached": {
                    "kickoff": cached.kickoff if cached else None,
                    "status": cached.status_short if cached else None,
                    "score": [cached.goals_home, cached.goals_away] if cached else None,
                },
                "live": live,
                "home_form": home_form,
                "away_form": away_form,
                "h2h": h2h,
            }
        )
