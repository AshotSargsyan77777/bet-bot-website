import logging

from django.conf import settings
from django.core import signing
from django.db import transaction
from rest_framework import generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsVipMember
from apps.checks.constants import COMBO_TIERS, combo_tier_for
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.checks.services.formatting import format_package
from apps.combinator.models import ComboOrder
from apps.combinator.search import build_candidate_pool, hit_chance, search_combinations
from apps.combinator.serializers import ComboOrderCreateSerializer, ComboOrderSerializer, ComboSearchSerializer
from apps.commerce.models import Payment, SelectionCandidate

logger = logging.getLogger(__name__)

MAX_POOL = 120
MAX_OFFERS = 6
LEG_ODDS_MIN, LEG_ODDS_MAX = 1.1, 3.0  # single pick odds used by the combinator
TOKEN_SALT = "combinator-offer"
TOKEN_MAX_AGE = 6 * 3600


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
    """How many picks are available today and the paid combination tiers (picks themselves are not exposed)."""

    permission_classes = (IsVipMember,)

    def get(self, request):
        pool = current_pool()
        tiers = [
            {"key": k, "label": t["label"], "price": t["price"], "min": t["min"], "max": t["max"], "upto": t["upto"]}
            for k, t in COMBO_TIERS.items()
        ]
        return Response({"count": len(pool), "tiers": tiers, "card_number": settings.CARD_NUMBER})


def _leg_key(leg: dict) -> list:
    return [leg.get("fixture_name") or "", leg.get("market") or "", leg.get("selection") or ""]


class CombinatorSearchView(APIView):
    """Finds combinations; returns only odds/size/chance/price plus a signed token to buy one."""

    permission_classes = (IsVipMember,)
    throttle_classes = (CombinatorThrottle,)

    def post(self, request):
        serializer = ComboSearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        pool = current_pool()
        if len(pool) > MAX_POOL:
            return Response(
                {"error": "too many candidates; narrow filters or wait for smaller pool", "code": "pool_too_large"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        tier = combo_tier_for(params["target_odds_max"])
        result = search_combinations(
            pool,
            target_min=params["target_odds_min"],
            target_max=params["target_odds_max"],
            legs_min=2,
            legs_max=params["max_legs"],
            leg_odds_min=LEG_ODDS_MIN,
            leg_odds_max=LEG_ODDS_MAX,
            max_results=MAX_OFFERS,
        )
        offers = []
        for combo in result["results"]:
            token = signing.dumps(
                {
                    "u": request.user.pk,
                    "min": params["target_odds_min"],
                    "max": params["target_odds_max"],
                    "legs": [_leg_key(leg) for leg in combo["legs"]],
                },
                salt=TOKEN_SALT,
                compress=True,
            )
            offers.append(
                {
                    "token": token,
                    "combined_odds": combo["combined_odds"],
                    "legs_count": combo["legs_count"],
                    "hit_chance": combo["hit_chance"],
                    "tier": tier,
                    "price": COMBO_TIERS[tier]["price"],
                }
            )
        return Response({"results": offers, "pool_size": len(pool), "timed_out": result["timed_out"]})


class ComboOrderListCreateView(generics.ListAPIView):
    """GET: my combinator orders (legs visible once paid) · POST: buy a found combination with a receipt."""

    permission_classes = (IsVipMember,)
    serializer_class = ComboOrderSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        return ComboOrder.objects.filter(user=self.request.user)

    def post(self, request):
        serializer = ComboOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            data = signing.loads(serializer.validated_data["token"], salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
        except signing.BadSignature:
            return Response(
                {"error": "Տարբերակի ժամկետը անցել է, որոնեք նորից", "code": "expired"}, status=status.HTTP_400_BAD_REQUEST
            )
        if data.get("u") != request.user.pk:
            return Response({"error": "Սխալ տարբերակ", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)

        # Rebuild the legs from today's pool: odds come from the server, never from the client.
        by_key = {tuple(_leg_key(item)): item for item in current_pool()}
        legs = [by_key.get(tuple(k)) for k in data["legs"]]
        if not legs or any(leg is None for leg in legs):
            return Response(
                {"error": "Ընտրանքները արդեն փոխվել են, որոնեք նորից", "code": "stale"}, status=status.HTTP_409_CONFLICT
            )
        product = 1.0
        for leg in legs:
            product *= leg["odd"]
        if not (data["min"] - 0.01 <= product <= data["max"] + 0.01):
            return Response(
                {"error": "Գործակիցները փոխվել են, որոնեք նորից", "code": "stale"}, status=status.HTTP_409_CONFLICT
            )
        tier = combo_tier_for(data["max"])
        price = COMBO_TIERS[tier]["price"]
        chance = hit_chance(legs)
        selections = [
            {"fixture": leg["fixture_name"], "fixture_id": leg.get("fixture_id"), "market": leg["market"],
             "selection": leg["selection"], "odd": leg["odd"], "probability": leg.get("probability"),
             "reasons": leg.get("reasons") or []}
            for leg in legs
        ]
        with transaction.atomic():
            order = ComboOrder.objects.create(
                user=request.user,
                tier=tier,
                price=price,
                combined_odds=round(product, 2),
                hit_chance=chance,
                legs=selections,
                body_text=format_package({"combined_odds": product, "selections": selections}),
            )
            Payment.objects.create(
                user=request.user,
                package_key=tier,
                amount=price,
                status=Payment.STATUS_PENDING,
                receipt=serializer.validated_data["receipt"],
                combo_order=order,
            )
        logger.info("Combo order %s (%s) created by %s", order.id, tier, request.user.username)
        return Response(ComboOrderSerializer(order).data, status=status.HTTP_201_CREATED)
