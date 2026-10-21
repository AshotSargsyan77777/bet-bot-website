from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.serializers import DailyCheckSerializer, build_catalog
from apps.checks.services.n8n import apply_n8n_packages
from apps.commerce.services import get_active_subscription


class CatalogView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        DailyCheck.ensure_defaults()
        app = AppSettings.get()
        return Response(
            {
                "packages": build_catalog(),
                "checks_date": app.checks_date,
                "disclaimer": settings.DISCLAIMER.strip(),
                "card_number": settings.CARD_NUMBER if request.user.is_authenticated else "",
            }
        )


class MyCheckView(APIView):
    def get(self, request):
        DailyCheck.ensure_defaults()
        sub = get_active_subscription(request.user)
        if not sub:
            return Response({"active": False})
        check = DailyCheck.objects.filter(package_key=sub.package_key).first()
        return Response(
            {
                "active": True,
                "package_key": sub.package_key,
                "text": sub.snapshot_text or (check.body_text if check else ""),
                "from_promo": sub.from_promo,
                "check": DailyCheckSerializer(check).data if check else None,
            }
        )


class InternalPackagesWebhook(APIView):
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        key = request.headers.get("X-Internal-Key") or request.headers.get("x-internal-key")
        if not settings.N8N_INTERNAL_KEY or key != settings.N8N_INTERNAL_KEY:
            return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        packages = request.data.get("packages") if isinstance(request.data, dict) else None
        if not isinstance(packages, list):
            return Response({"error": "packages must be an array"}, status=status.HTTP_400_BAD_REQUEST)
        result = apply_n8n_packages(packages)
        return Response(result)


class AdminChecksView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        DailyCheck.ensure_defaults()
        checks = DailyCheck.objects.all()
        return Response(DailyCheckSerializer(checks, many=True).data)

    def patch(self, request):
        pkg = request.data.get("package_key")
        text = request.data.get("body_text")
        if not pkg or text is None:
            return Response({"error": "package_key and body_text required"}, status=400)
        DailyCheck.ensure_defaults()
        check = DailyCheck.objects.filter(package_key=pkg).first()
        if not check:
            return Response({"error": "unknown package"}, status=404)
        check.body_text = text
        check.is_available = True
        check.save()
        app = AppSettings.get()
        from apps.checks.services.time import yerevan_today

        app.checks_date = yerevan_today()
        app.save()
        return Response(DailyCheckSerializer(check).data)
