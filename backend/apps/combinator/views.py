from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsVipMember
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.combinator.search import build_candidate_pool, search_combinations
from apps.commerce.models import SelectionCandidate


class CombinatorThrottle(SimpleRateThrottle):
    scope = "combinator"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class CombinatorPoolView(APIView):
    permission_classes = (IsVipMember,)
    throttle_classes = (CombinatorThrottle,)

    def get(self, request):
        selections_lists = []
        for check in DailyCheck.objects.all():
            if check_is_ready(check) and check.selections_json:
                selections_lists.append(check.selections_json)
        admin = list(
            SelectionCandidate.objects.filter(active=True).values(
                "fixture_name", "fixture_id", "market", "selection", "odd", "reasons"
            )
        )
        pool = build_candidate_pool(selections_lists, admin)
        return Response({"count": len(pool), "candidates": pool})


class CombinatorSearchView(APIView):
    permission_classes = (IsVipMember,)
    throttle_classes = (CombinatorThrottle,)

    def post(self, request):
        data = request.data
        selections_lists = []
        for check in DailyCheck.objects.all():
            if check_is_ready(check) and check.selections_json:
                selections_lists.append(check.selections_json)
        admin = list(
            SelectionCandidate.objects.filter(active=True).values(
                "fixture_name", "fixture_id", "market", "selection", "odd", "reasons"
            )
        )
        pool = build_candidate_pool(selections_lists, admin)
        if len(pool) > 120:
            return Response(
                {"error": "too many candidates; narrow filters or wait for smaller pool"},
                status=413,
            )

        result = search_combinations(
            pool,
            target_min=float(data.get("target_odds_min", 1)),
            target_max=float(data.get("target_odds_max", 100)),
            legs_count=data.get("legs_count"),
            legs_min=data.get("legs_min"),
            legs_max=data.get("legs_max"),
            leg_odds_min=float(data.get("leg_odds_min", 1.01)),
            leg_odds_max=float(data.get("leg_odds_max", 50)),
            markets=data.get("markets"),
            max_results=min(int(data.get("max_results", 20)), 20),
        )
        return Response(result)
