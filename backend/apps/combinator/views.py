import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import user_is_admin
from apps.checks.constants import COMBO_TIERS
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.checks.services.formatting import format_package
from apps.checks.services.time import yerevan_today
from apps.combinator.models import ComboOrder
from apps.combinator.pool import todays_selections
from apps.combinator.search import _fixture_key, build_candidate_pool, search_combinations
from apps.combinator.serializers import (
    ComboOrderCreateSerializer,
    ComboOrderSerializer,
    ComboSearchSerializer,
)
from apps.commerce.models import Payment, SelectionCandidate
from apps.games.models import FixtureCache

logger = logging.getLogger(__name__)

MAX_POOL = 320
MAX_OFFERS = 10
LEG_ODDS_MIN = 1.1  # the highest single-pick odds is the tier's own maximum (so even x20 with one match)


class CombinatorThrottle(SimpleRateThrottle):
    scope = "combinator"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def current_pool() -> list[dict]:
    """Today's ready check selections + n8n's combinator picks + admin-added active candidates.

    Built only from stored data, so using the combinator never spends API-Football requests.
    """
    checks_date = AppSettings.get().checks_date
    selections_lists = [
        check.selections_json
        for check in DailyCheck.objects.all()
        if check.selections_json and check_is_ready(check, checks_date)
    ]
    selections_lists.append(todays_selections(yerevan_today()))
    admin = list(
        SelectionCandidate.objects.filter(active=True).values(
            "fixture_name", "fixture_id", "market", "selection", "odd", "reasons"
        )
    )
    return _drop_started(build_candidate_pool(selections_lists, admin))


def _drop_started(pool: list[dict]) -> list[dict]:
    """Removes picks whose match has already kicked off (when the fixture is known locally)."""
    ids = {int(c["fixture_id"]) for c in pool if str(c.get("fixture_id") or "").isdigit()}
    if not ids:
        return pool
    started = {
        str(i)
        for i in FixtureCache.objects.filter(api_fixture_id__in=ids, kickoff__lte=timezone.now()).values_list(
            "api_fixture_id", flat=True
        )
    }
    return [c for c in pool if str(c.get("fixture_id") or "") not in started]


def tier_access(user, today: str) -> tuple[set[str], set[str]]:
    """(unlocked, pending) tiers for today. Admins have every tier for free."""
    if user_is_admin(user):
        return set(COMBO_TIERS), set()
    rows = ComboOrder.objects.filter(user=user, valid_date=today).exclude(status=ComboOrder.STATUS_REJECTED)
    unlocked = {o.tier for o in rows if o.status == ComboOrder.STATUS_PAID}
    pending = {o.tier for o in rows if o.status == ComboOrder.STATUS_PENDING} - unlocked
    return unlocked, pending


def _tiers_payload() -> list[dict]:
    return [
        {"key": k, "label": t["label"], "price": t["price"], "min": t["min"], "max": t["max"]}
        for k, t in COMBO_TIERS.items()
    ]


class CombinatorPoolView(APIView):
    """How many picks are available today, the paid tiers and which of them this user has unlocked."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        pool = current_pool()
        unlocked, pending = tier_access(request.user, yerevan_today())
        return Response(
            {
                "count": len(pool),
                "fixtures": fixtures_in(pool),  # the most matches a variant can have today
                "tiers": _tiers_payload(),
                "unlocked": sorted(unlocked),
                "pending": sorted(pending),
                "is_admin": user_is_admin(request.user),
                "card_number": settings.CARD_NUMBER,
            }
        )


class CombinatorSearchView(APIView):
    """Today's variants for a tier. Picks are shown only once the tier is paid for today (or to admins)."""

    permission_classes = (permissions.IsAuthenticated,)
    throttle_classes = (CombinatorThrottle,)

    def post(self, request):
        serializer = ComboSearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        tier_key = params["tier"]
        tier = COMBO_TIERS[tier_key]
        pool = current_pool()
        if len(pool) > MAX_POOL:
            return Response(
                {"error": "too many candidates; narrow filters or wait for smaller pool", "code": "pool_too_large"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        available = fixtures_in(pool)
        if params["legs"] > available:
            return Response(
                {"error": f"Այսօր հասանելի է ընդամենը {available} խաղ", "code": "too_many_legs", "fixtures": available},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = search_combinations(
            pool,
            target_min=tier["min"],
            target_max=tier["max"],
            legs_count=params["legs"],
            leg_odds_min=LEG_ODDS_MIN,
            leg_odds_max=tier["max"],
            max_results=MAX_OFFERS,
        )
        unlocked, pending = tier_access(request.user, yerevan_today())
        is_open = tier_key in unlocked
        variants = []
        for combo in result["results"]:
            item = {
                "combined_odds": combo["combined_odds"],
                "legs_count": combo["legs_count"],
                "hit_chance": combo["hit_chance"],
            }
            if is_open:
                selections = [_selection(leg) for leg in combo["legs"]]
                item["legs"] = selections
                item["body_text"] = format_package({"combined_odds": combo["combined_odds"], "selections": selections})
            variants.append(item)
        return Response(
            {
                "tier": tier_key,
                "price": tier["price"],
                "unlocked": is_open,
                "pending": tier_key in pending,
                "results": variants,
                "pool_size": len(pool),
                "timed_out": result["timed_out"],
            }
        )


def fixtures_in(pool: list[dict]) -> int:
    return len({_fixture_key(c) for c in pool})


def _selection(leg: dict) -> dict:
    return {
        "fixture": leg["fixture_name"],
        "fixture_id": leg.get("fixture_id"),
        "market": leg["market"],
        "selection": leg["selection"],
        "odd": leg["odd"],
        "probability": leg.get("probability"),
        "reasons": leg.get("reasons") or [],
    }


class ComboOrderListCreateView(generics.ListAPIView):
    """GET: my combinator purchases · POST: pay for a tier; once approved, all of today's variants open."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ComboOrderSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        return ComboOrder.objects.filter(user=self.request.user)

    def post(self, request):
        serializer = ComboOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tier = serializer.validated_data["tier"]
        today = yerevan_today()
        if user_is_admin(request.user):
            return Response({"error": "Ադմինի համար անվճար է", "code": "free_for_admin"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            # serialize concurrent purchases of the same user
            type(request.user).objects.select_for_update().filter(pk=request.user.pk).first()
            unlocked, pending = tier_access(request.user, today)
            if tier in unlocked or tier in pending:
                return Response(
                    {"error": "Այս մակարդակը այսօր արդեն գնված է կամ սպասում է հաստատման", "code": "duplicate"},
                    status=status.HTTP_409_CONFLICT,
                )
            price = COMBO_TIERS[tier]["price"]
            order = ComboOrder.objects.create(user=request.user, tier=tier, price=price, valid_date=today)
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
