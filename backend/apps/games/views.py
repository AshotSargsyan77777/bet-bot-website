from datetime import date as date_cls

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, F, Q
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analysis.models import MatchAnalysis
from apps.analysis.views import analysis_info
from apps.checks.services.time import yerevan_today
from apps.games.football_api import FootballApiError, fixture_by_id, head_to_head, is_configured
from apps.games.form_stats import aggregate_form
from apps.games.leagues import site_leagues
from apps.games.models import FixtureCache
from apps.games.tasks import compute_fixture_form, needs_sync, sync_fixtures_for_date
from config.i18n import localize
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
    analysis = serializers.BooleanField(required=False, default=False)  # only matches with a match analysis


class GameDetailQuerySerializer(serializers.Serializer):
    last_n = serializers.IntegerField(required=False, min_value=1, max_value=10, default=5)


def team_logo(team_id) -> str | None:
    """API-Football's public logo images (served by its CDN, not counted as API requests)."""
    return f"https://media.api-sports.io/football/teams/{team_id}.png" if team_id else None


def league_logo(league_id) -> str | None:
    return f"https://media.api-sports.io/football/leagues/{league_id}.png" if league_id else None


def serialize_fixture(f: FixtureCache, analysis: dict | None = None) -> dict:
    return {
        "id": f.api_fixture_id,
        "league": f.league_name,
        "league_id": f.league_id,
        "league_logo": league_logo(f.league_id),
        "home": f.home_team_name,
        "away": f.away_team_name,
        "home_logo": team_logo(f.home_team_id),
        "away_logo": team_logo(f.away_team_id),
        "analysis": analysis,
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
        # cache.add: at most one API attempt per date every 2 minutes, even if it fails
        if is_configured() and needs_sync(day) and cache.add(f"fixture-sync-attempt:{day}", 1, 120):
            result = sync_fixtures_for_date(day)
            provider_error = result.get("error")

        qs = day_qs.site_leagues()
        # .order_by() drops the model's default ordering, otherwise GROUP BY also groups by kickoff
        counts = {
            row["league_id"]: row["n"]
            for row in qs.order_by().values("league_id").annotate(n=Count("id"))
        }
        if params.get("league"):
            qs = qs.filter(league_id=params["league"])
        if params["analysis"]:
            qs = qs.filter(api_fixture_id__in=MatchAnalysis.objects.values("fixture_id"))
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

        analyses = analysis_info(request.user, [f.api_fixture_id for f in page])
        response = paginator.get_paginated_response(
            [serialize_fixture(f, analyses.get(f.api_fixture_id)) for f in page]
        )
        response.data.update(
            {
                "date": day,
                "leagues": site_leagues(counts),
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
        league_id = cached.league_id if cached else ((live or {}).get("league") or {}).get("id")

        home_form = away_form = h2h = None
        stats_error = None
        try:
            if home_id:
                home_form = aggregate_form(home_id, home_name or "", last_n, "all")
            if away_id:
                away_form = aggregate_form(away_id, away_name or "", last_n, "all")
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
            stats_error = str(e) if settings.DEBUG else localize("Վիճակագրությունը ժամանակավորապես անհասանելի է")

        return Response(
            {
                "fixture_id": fixture_id,
                "league": league or "",
                "league_logo": league_logo(league_id),
                "home_logo": team_logo(home_id),
                "away_logo": team_logo(away_id),
                "analysis": analysis_info(request.user, [fixture_id]).get(fixture_id),
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
