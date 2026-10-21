from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsVipMember
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.combinator.search import build_candidate_pool, search_combinations
from apps.combinator.serializers import CombinatorSearchSerializer
from apps.commerce.models import SelectionCandidate

MAX_POOL = 120


class CombinatorThrottle(SimpleRateThrottle):
    scope = "combinator"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def current_pool() -> list[dict]:
    """Today's ready check selections + admin-added active candidates."""
    checks_date = AppSettings.get().checks_date
    selections_lists = [
        check.selections_json
        for check in DailyCheck.objects.all()
        if check.selections_json and check_is_ready(check, checks_date)
    ]
    admin = list(
        SelectionCandidate.objects.filter(active=True).values(
            "fixture_name", "fixture_id", "market", "selection", "odd", "reasons"
        )
    )
    return build_candidate_pool(selections_lists, admin)


class CombinatorPoolView(APIView):
    permission_classes = (IsVipMember,)

    def get(self, request):
        pool = current_pool()
        return Response({"count": len(pool), "candidates": pool})


class CombinatorSearchView(APIView):
    permission_classes = (IsVipMember,)
    throttle_classes = (CombinatorThrottle,)

    def post(self, request):
        serializer = CombinatorSearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        pool = current_pool()
        if len(pool) > MAX_POOL:
            return Response(
                {"error": "too many candidates; narrow filters or wait for smaller pool", "code": "pool_too_large"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        result = search_combinations(
            pool,
            target_min=params["target_odds_min"],
            target_max=params["target_odds_max"],
            legs_count=params.get("legs_count"),
            legs_min=params.get("legs_min"),
            legs_max=params.get("legs_max"),
            leg_odds_min=params["leg_odds_min"],
            leg_odds_max=params["leg_odds_max"],
            markets=params.get("markets") or None,
            max_results=params["max_results"],
        )
        return Response({**result, "pool_size": len(pool)})
