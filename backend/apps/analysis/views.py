import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import user_is_admin
from apps.analysis.models import AnalysisOrder, MatchAnalysis
from apps.checks.constants import ANALYSIS_KEY, ANALYSIS_PRODUCT
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment
from apps.games.leagues import LEAGUE_NAMES
from apps.games.models import FixtureCache

logger = logging.getLogger(__name__)
PRICE = ANALYSIS_PRODUCT[ANALYSIS_KEY]["price"]


class BuySerializer(serializers.Serializer):
    receipt = serializers.ImageField()

    def validate_receipt(self, value):
        from apps.commerce.serializers import PaymentCreateSerializer

        return PaymentCreateSerializer().validate_receipt(value)


def _access(user, analyses) -> dict[int, str]:
    """analysis id → "open" | "pending" for this user (admins: everything open, for free)."""
    if not user or not user.is_authenticated:
        return {}
    if user_is_admin(user):
        return {a.id: "open" for a in analyses}
    out: dict[int, str] = {}
    rows = AnalysisOrder.objects.filter(user=user, analysis__in=analyses).exclude(status=AnalysisOrder.STATUS_REJECTED)
    for order in rows:
        if order.status == AnalysisOrder.STATUS_PAID:
            out[order.analysis_id] = "open"
        else:
            out.setdefault(order.analysis_id, "pending")
    return out


def _kickoffs(analyses) -> dict[int, object]:
    ids = [a.fixture_id for a in analyses]
    return dict(FixtureCache.objects.filter(api_fixture_id__in=ids).values_list("api_fixture_id", "kickoff"))


def analysis_info(user, fixture_ids) -> dict[int, dict]:
    """fixture id → {id, access, price} for matches that have an analysis (the latest one per match)."""
    latest: dict[int, MatchAnalysis] = {}
    for a in MatchAnalysis.objects.filter(fixture_id__in=list(fixture_ids)).order_by("date", "id"):
        latest[a.fixture_id] = a
    access = _access(user, list(latest.values()))
    return {fid: {"id": a.id, "access": access.get(a.id, "locked"), "price": PRICE} for fid, a in latest.items()}


def _summary(a: MatchAnalysis, kickoff, access: str | None) -> dict:
    return {
        "id": a.id,
        "date": a.date,
        "fixture_id": a.fixture_id,
        "home": a.home,
        "away": a.away,
        "league_id": a.league_id,
        "league": LEAGUE_NAMES.get(a.league_id, ""),
        "kickoff": kickoff,
        "started": bool(kickoff and kickoff <= timezone.now()),
        "price": PRICE,
        "access": access or "locked",
    }


class AnalysisListView(APIView):
    """Today's matches with a full analysis for sale (contents are not exposed here)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        analyses = list(MatchAnalysis.objects.filter(date=yerevan_today()))
        kickoffs = _kickoffs(analyses)
        access = _access(request.user, analyses)
        rows = [_summary(a, kickoffs.get(a.fixture_id), access.get(a.id)) for a in analyses]
        far = timezone.now() + timedelta(days=3650)
        rows.sort(key=lambda r: (r["started"], r["kickoff"] or far, r["id"]))
        return Response({"results": rows, "price": PRICE})


class MyAnalysesView(APIView):
    def get(self, request):
        orders = AnalysisOrder.objects.filter(user=request.user).select_related("analysis")[:50]
        return Response(
            {
                "results": [
                    {
                        "id": o.analysis_id,
                        "fixture_id": o.analysis.fixture_id,
                        "home": o.analysis.home,
                        "away": o.analysis.away,
                        "date": o.analysis.date,
                        "status": o.status,
                        "created_at": o.created_at,
                    }
                    for o in orders
                ]
            }
        )


class AnalysisDetailView(APIView):
    """The full analysis — only for users who paid for it (and admins)."""

    def get(self, request, pk: int):
        a = get_object_or_404(MatchAnalysis, pk=pk)
        access = _access(request.user, [a]).get(a.id)
        data = _summary(a, _kickoffs([a]).get(a.fixture_id), access)
        if access == "open":
            data.update({"report": a.report, "picks": a.picks})
        return Response(data)


class AnalysisBuyView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, pk: int):
        a = get_object_or_404(MatchAnalysis, pk=pk)
        serializer = BuySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if user_is_admin(request.user):
            return Response({"error": "Ադմինի համար անվճար է", "code": "free_for_admin"}, status=status.HTTP_400_BAD_REQUEST)
        kickoff = _kickoffs([a]).get(a.fixture_id)
        if kickoff and kickoff <= timezone.now():
            return Response({"error": "Խաղն արդեն սկսվել է", "code": "started"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            get_user_model().objects.select_for_update().filter(pk=request.user.pk).first()  # one purchase at a time
            if _access(request.user, [a]).get(a.id):
                return Response(
                    {"error": "Այս վերլուծությունը արդեն գնված է կամ սպասում է հաստատման", "code": "duplicate"},
                    status=status.HTTP_409_CONFLICT,
                )
            order = AnalysisOrder.objects.create(user=request.user, analysis=a, price=PRICE)
            Payment.objects.create(
                user=request.user,
                package_key=ANALYSIS_KEY,
                amount=PRICE,
                status=Payment.STATUS_PENDING,
                receipt=serializer.validated_data["receipt"],
                analysis_order=order,
            )
        logger.info("Analysis order %s (%s) created by %s", order.id, a, request.user.username)
        return Response({"id": a.id, "access": "pending"}, status=status.HTTP_201_CREATED)
