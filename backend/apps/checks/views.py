import hmac
import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser
from apps.checks.constants import N8N_KEYS
from apps.checks.models import AppSettings, CheckRecord, DailyCheck
from apps.checks.serializers import (
    AdminCheckUpdateSerializer,
    AdminRecordUpdateSerializer,
    CheckRecordSerializer,
    DailyCheckSerializer,
    build_catalog,
)
from apps.checks.services.checks_logic import ready_package_keys
from apps.checks.services.n8n import apply_n8n_packages
from apps.checks.services.records import record_published_check, results_stats, visible_history
from apps.checks.services.settlement import settle_pending_records
from apps.checks.services.time import yerevan_today
from apps.commerce.services import get_active_subscription

logger = logging.getLogger(__name__)

MAX_WEBHOOK_PACKAGES = 50


class CatalogView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        DailyCheck.ensure_defaults()
        app = AppSettings.get()
        return Response(
            {
                "packages": build_catalog(),
                "checks_date": app.checks_date,
                "today": yerevan_today(),
                "disclaimer": settings.DISCLAIMER.strip(),
                "card_number": settings.CARD_NUMBER if request.user.is_authenticated else "",
            }
        )


class PublicSummaryView(APIView):
    """Real-time numbers for the landing page."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        from apps.games.models import FixtureCache
        from apps.games.views import LIVE_STATUSES

        DailyCheck.ensure_defaults()
        today = yerevan_today()
        ready = [k for k in ready_package_keys() if k in N8N_KEYS]
        games_today = FixtureCache.objects.filter(kickoff__date=today).site_leagues()
        return Response(
            {
                "today": today,
                "checks_date": AppSettings.get().checks_date,
                "ready_packages": len(ready),
                "total_packages": len(N8N_KEYS),
                "games_today": games_today.count(),
                "live_games": games_today.filter(status_short__in=LIVE_STATUSES).count(),
                "games_provider_configured": bool(settings.API_FOOTBALL_KEY),
                "results_30d": {k: v for k, v in results_stats(30).items() if k in ("won", "lost", "settled", "win_rate")},
            }
        )


class MyCheckView(APIView):
    def get(self, request):
        sub = get_active_subscription(request.user)
        if not sub:
            return Response({"active": False})
        check = DailyCheck.objects.filter(package_key=sub.package_key).first()
        return Response(
            {
                "active": True,
                "package_key": sub.package_key,
                "valid_date": sub.valid_date,
                "text": sub.snapshot_text or (check.body_text if check else ""),
                "from_promo": sub.from_promo,
            }
        )


class InternalPackagesWebhook(APIView):
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    throttle_classes = ()

    def post(self, request):
        key = request.headers.get("X-Internal-Key") or ""
        expected = settings.N8N_INTERNAL_KEY
        if not expected or not hmac.compare_digest(key.encode(), expected.encode()):
            logger.warning("Rejected n8n webhook call with invalid key from %s", request.META.get("REMOTE_ADDR"))
            return Response({"error": "unauthorized", "code": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        packages = request.data.get("packages") if isinstance(request.data, dict) else None
        if not isinstance(packages, list):
            return Response(
                {"error": "packages must be an array", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(packages) > MAX_WEBHOOK_PACKAGES or not all(isinstance(p, dict) for p in packages):
            return Response(
                {"error": "packages must be a list of objects (max 50)", "code": "invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = apply_n8n_packages(packages)
        logger.info("n8n packages applied: %s available, date %s", result["available"], result["checks_date"])
        return Response(result)


class AdminChecksView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        DailyCheck.ensure_defaults()
        app = AppSettings.get()
        checks = DailyCheck.objects.order_by("id")
        data = DailyCheckSerializer(checks, many=True, context={"checks_date": app.checks_date}).data
        return Response({"checks_date": app.checks_date, "today": yerevan_today(), "checks": data})

    def patch(self, request):
        """Manual check text (bot's /setcheck): a manually set check counts as today's."""
        serializer = AdminCheckUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        DailyCheck.ensure_defaults()
        check = DailyCheck.objects.get(package_key=serializer.validated_data["package_key"])
        check.body_text = serializer.validated_data["body_text"]
        check.is_available = serializer.validated_data["is_available"]
        check.save()
        app = AppSettings.get()
        app.checks_date = yerevan_today()
        app.save(update_fields=["checks_date"])
        if check.is_available:
            check.selections_json = []  # manual text: no structured legs, result is set by the admin
            check.save(update_fields=["selections_json"])
            record_published_check(check, app.checks_date)
        else:
            check.current_record = None
            check.save(update_fields=["current_record"])
        logger.info("Admin %s updated check %s", request.user.username, check.package_key)
        return Response(DailyCheckSerializer(check, context={"checks_date": app.checks_date}).data)


def _check_internal_key(request) -> bool:
    key = request.headers.get("X-Internal-Key") or ""
    expected = settings.N8N_INTERNAL_KEY
    return bool(expected) and hmac.compare_digest(key.encode(), expected.encode())


class CheckHistoryView(generics.ListAPIView):
    """Public archive of past checks with their results (today's checks stay paid)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = CheckRecordSerializer

    def get_queryset(self):
        qs = visible_history().order_by("-date", "package_key", "-created_at")
        package = self.request.query_params.get("package")
        if package:
            qs = qs.filter(package_key=package)
        result = self.request.query_params.get("status")
        if result in dict(CheckRecord.STATUS_CHOICES):
            qs = qs.filter(status=result)
        return qs


class CheckHistoryStatsView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        try:
            days = min(max(int(request.query_params.get("days", 30)), 1), 365)
        except ValueError:
            days = 30
        return Response(results_stats(days))


class InternalSettleWebhook(APIView):
    """Called by n8n (hourly) to settle finished checks."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    throttle_classes = ()

    def post(self, request):
        if not _check_internal_key(request):
            return Response({"error": "unauthorized", "code": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(settle_pending_records())


class AdminRecordsView(generics.ListAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = CheckRecordSerializer

    def get_queryset(self):
        qs = CheckRecord.objects.all()
        result = self.request.query_params.get("status")
        if result in dict(CheckRecord.STATUS_CHOICES):
            qs = qs.filter(status=result)
        return qs

    def post(self, request):
        """Runs automatic settlement now."""
        return Response(settle_pending_records())


class AdminRecordDetailView(APIView):
    permission_classes = (IsAdminUser,)

    def patch(self, request, pk: int):
        record = CheckRecord.objects.filter(pk=pk).first()
        if not record:
            return Response({"error": "Չեկը չի գտնվել", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminRecordUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record.status = serializer.validated_data["status"]
        record.settled_manually = record.status != CheckRecord.STATUS_PENDING
        record.settled_at = timezone.now() if record.settled_manually else None
        record.save(update_fields=["status", "settled_manually", "settled_at"])
        logger.info("Admin %s set record %s to %s", request.user.username, pk, record.status)
        return Response(CheckRecordSerializer(record).data)
