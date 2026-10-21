import hmac
import logging

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser
from apps.checks.constants import N8N_KEYS
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.serializers import AdminCheckUpdateSerializer, DailyCheckSerializer, build_catalog
from apps.checks.services.checks_logic import ready_package_keys
from apps.checks.services.n8n import apply_n8n_packages
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
        games_today = FixtureCache.objects.filter(kickoff__date=today)
        return Response(
            {
                "today": today,
                "checks_date": AppSettings.get().checks_date,
                "ready_packages": len(ready),
                "total_packages": len(N8N_KEYS),
                "games_today": games_today.count(),
                "live_games": games_today.filter(status_short__in=LIVE_STATUSES).count(),
                "games_provider_configured": bool(settings.API_FOOTBALL_KEY),
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
        logger.info("Admin %s updated check %s", request.user.username, check.package_key)
        return Response(DailyCheckSerializer(check, context={"checks_date": app.checks_date}).data)
