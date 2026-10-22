from datetime import date as date_cls

from django.conf import settings
from django.db.models import F, Q
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.checks.services.time import yerevan_today
from apps.games.football_api import FootballApiError, fixture_by_id, head_to_head, is_configured
from apps.games.form_stats import VENUES, aggregate_form
from apps.games.models import FixtureCache
from apps.games.tasks import compute_fixture_form, sync_fixtures_for_date
from config.pagination import StandardPagination

LIVE_STATUSES = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"]
FINISHED_STATUSES = ["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"]
# Max fixtures whose form is fetched from API-Football during a single list request.
FORM_COMPUTE_BUDGET = 40


class GameListQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    q = serializers.CharField(required=False, allow_blank=True, max_length=100)
    league = serializers.IntegerField(required=False, min_value=1)
    status = serializers.ChoiceField(choices=["", "live", "upcoming", "finished"], required=False)
    min_win_pct = serializers.FloatField(required=False, min_value=0, max_value=100)
    sort = serializers.ChoiceField(choices=["kickoff", "form_diff"], required=False, default="kickoff")


class GameDetailQuerySerializer(serializers.Serializer):
    last_n = serializers.IntegerField(required=False, min_value=1, max_value=10, default=5)
    home_venue = serializers.ChoiceField(choices=VENUES, required=False, default="all")
    away_venue = serializers.ChoiceField(choices=VENUES, required=False, default="all")


def serialize_fixture(f: FixtureCache) -> dict:
    return {
        "id": f.api_fixture_id,
        "league": f.league_name,
        "league_id": f.league_id,
        "home": f.home_team_name,
        "away": f.away_team_name,
        "kickoff": f.kickoff,
        "status": f.status_short,
        "score": [f.goals_home, f.goals_away],
        "home_form": f.home_form,
        "away_form": f.away_form,
        "form_diff": f.form_diff,
    }


class GameListView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        params_s = GameListQuerySerializer(data=request.query_params)
        params_s.is_valid(raise_exception=True)
        params = params_s.validated_data
        day = (params.get("date") or date_cls.fromisoformat(yerevan_today())).isoformat()

        provider_error = None
        day_qs = FixtureCache.objects.filter(kickoff__date=day)
        if is_configured() and not day_qs.exists():
            result = sync_fixtures_for_date(day)
            provider_error = result.get("error")

        qs = day_qs.site_leagues()
        order = {lid: i for i, lid in enumerate(settings.GAMES_LEAGUE_IDS)}
        leagues = sorted(
            qs.exclude(league_id__isnull=True).values("league_id", "league_name").distinct(),
            key=lambda lg: (order.get(lg["league_id"], len(order)), lg["league_name"]),
        )
        if params.get("league"):
            qs = qs.filter(league_id=params["league"])
        status_f = params.get("status")
        if status_f == "live":
            qs = qs.filter(status_short__in=LIVE_STATUSES)
        elif status_f == "upcoming":
            qs = qs.exclude(status_short__in=LIVE_STATUSES + FINISHED_STATUSES)
        elif status_f == "finished":
            qs = qs.filter(status_short__in=FINISHED_STATUSES)
        q = (params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(home_team_name__icontains=q) | Q(away_team_name__icontains=q) | Q(league_name__icontains=q))

        uses_form = params.get("min_win_pct") is not None or params["sort"] == "form_diff"
        if uses_form and is_configured():
            # Form-based filters need stats on every candidate fixture, so fill missing ones first (bounded).
            for f in qs.filter(stats_computed_at__isnull=True).order_by("kickoff")[:FORM_COMPUTE_BUDGET]:
                compute_fixture_form(f)

        if params.get("min_win_pct") is not None:
            qs = qs.filter(home_win_pct__gte=params["min_win_pct"])
        if params["sort"] == "form_diff":
            qs = qs.order_by(F("form_diff").desc(nulls_last=True), "kickoff")
        else:
            qs = qs.order_by("kickoff", "api_fixture_id")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if is_configured():
            for f in page:
                if f.stats_computed_at is None:
                    compute_fixture_form(f)

        response = paginator.get_paginated_response([serialize_fixture(f) for f in page])
        response.data.update(
            {
                "date": day,
                "leagues": [{"id": lg["league_id"], "name": lg["league_name"]} for lg in leagues],
                "provider_configured": is_configured(),
                "provider_error": provider_error,
                "form_pending": qs.filter(stats_computed_at__isnull=True).count() if is_configured() else 0,
            }
        )
        return response


class GameDetailView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request, fixture_id: int):
        params_s = GameDetailQuerySerializer(data=request.query_params)
        params_s.is_valid(raise_exception=True)
        params = params_s.validated_data
        last_n = params["last_n"]

        cached = FixtureCache.objects.filter(api_fixture_id=fixture_id).first()
        live = None
        if is_configured():
            try:
                live = fixture_by_id(fixture_id)
            except FootballApiError:
                live = None
        if live is None and cached:
            live = cached.raw_json or None

        if not cached and not live:
            if not is_configured():
                return Response(
                    {"error": "Խաղերի տվյալների մատակարարը (API-Football) կարգավորված չէ", "code": "provider_unconfigured"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response({"error": "Խաղը չի գտնվել", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)

        live_teams = (live or {}).get("teams") or {}
        home_id = cached.home_team_id if cached else (live_teams.get("home") or {}).get("id")
        away_id = cached.away_team_id if cached else (live_teams.get("away") or {}).get("id")
        home_name = cached.home_team_name if cached else (live_teams.get("home") or {}).get("name")
        away_name = cached.away_team_name if cached else (live_teams.get("away") or {}).get("name")
        league = cached.league_name if cached else ((live or {}).get("league") or {}).get("name")

        home_form = away_form = h2h = None
        stats_error = None
        try:
            if home_id:
                home_form = aggregate_form(home_id, home_name or "", last_n, params["home_venue"])
            if away_id:
                away_form = aggregate_form(away_id, away_name or "", last_n, params["away_venue"])
            if home_id and away_id:
                h2h_raw = head_to_head(home_id, away_id, last_n)
                h2h = [
                    {
                        "date": (m.get("fixture") or {}).get("date"),
                        "home": ((m.get("teams") or {}).get("home") or {}).get("name"),
                        "away": ((m.get("teams") or {}).get("away") or {}).get("name"),
                        "goals": m.get("goals"),
                    }
                    for m in h2h_raw
                ]
        except FootballApiError as e:
            stats_error = str(e) if settings.DEBUG else "Վիճակագրությունը ժամանակավորապես անհասանելի է"

        return Response(
            {
                "fixture_id": fixture_id,
                "league": league or "",
                "home": home_name or "",
                "away": away_name or "",
                "cached": {
                    "kickoff": cached.kickoff if cached else None,
                    "status": cached.status_short if cached else None,
                    "score": [cached.goals_home, cached.goals_away] if cached else None,
                },
                "live": live,
                "home_form": home_form,
                "away_form": away_form,
                "h2h": h2h,
                "stats_error": stats_error,
            }
        )
