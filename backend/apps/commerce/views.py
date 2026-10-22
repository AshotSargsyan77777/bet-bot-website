import logging
import mimetypes

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser, user_is_admin
from apps.checks.constants import PACKAGES, product_label
from apps.checks.models import AppSettings
from apps.checks.services.checks_logic import ready_package_keys
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment, PromoCode, SelectionCandidate, Subscription, VipMember
from apps.commerce.promo import generate_promo_codes, promo_counts
from apps.commerce.serializers import (
    AdminPaymentActionSerializer,
    AdminPaymentSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    PromoGenerateSerializer,
    PromoRedeemSerializer,
    SelectionCandidateSerializer,
)
from apps.commerce.services import (
    PaymentStateError,
    approve_payment,
    get_active_subscription,
    redeem_promo,
    reject_payment,
)
from apps.support.models import SupportTicket

logger = logging.getLogger(__name__)


class PaymentListCreateView(generics.ListCreateAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PaymentCreateSerializer
        return PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        # A new receipt replaces the user's previous pending one (same as the Telegram bot).
        Payment.objects.filter(user=self.request.user, status=Payment.STATUS_PENDING).exclude(
            package_key__startswith="combo_"
        ).update(status=Payment.STATUS_REJECTED)
        pkg = serializer.validated_data["package_key"]
        payment = serializer.save(
            user=self.request.user, status=Payment.STATUS_PENDING, amount=PACKAGES[pkg]["price"]
        )
        logger.info("Payment %s created by %s for %s", payment.id, self.request.user.username, payment.package_key)


class PromoRedeemView(APIView):
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "promo"

    MESSAGES = {
        "invalid": "❌ Սխալ կոդ",
        "used": "❌ Այս կոդն արդեն օգտագործված է",
        "already_subscribed": "✅ Դու արդեն ունես ակտիվ փաթեթ",
        "not_ready": "⏳ Պրոմո չեկը այսօր դեռ պատրաստ չէ",
    }

    def post(self, request):
        serializer = PromoRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ok, detail = redeem_promo(request.user, serializer.validated_data["code"])
        if not ok:
            return Response(
                {"ok": False, "error": self.MESSAGES.get(detail, detail), "code": detail},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True, "package_key": detail})


class VipStatusView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        # admins get everything for free, VIP included
        is_vip = user_is_admin(request.user) or (
            request.user.is_authenticated and VipMember.objects.filter(user=request.user).exists()
        )
        return Response(
            {
                "is_vip": is_vip,
                # The private channel link is only revealed to members.
                "link": settings.VIP_CHANNEL_LINK if is_vip else "",
                "price": PACKAGES["pkg_vip"]["price"],
            }
        )


class StatusView(APIView):
    def get(self, request):
        sub = get_active_subscription(request.user)
        pkg = PACKAGES.get(sub.package_key) if sub else None
        vip = user_is_admin(request.user) or VipMember.objects.filter(user=request.user).exists()
        pending = Payment.objects.filter(user=request.user, status=Payment.STATUS_PENDING).first()
        return Response(
            {
                "has_active_check": bool(sub),
                "package": pkg,
                "package_key": sub.package_key if sub else None,
                "valid_date": sub.valid_date if sub else None,
                "is_vip": vip,
                "pending_payment": PaymentSerializer(pending).data if pending else None,
            }
        )


class AdminPaymentsView(generics.ListAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = AdminPaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.select_related("user", "reviewed_by")
        status_f = self.request.query_params.get("status", Payment.STATUS_PENDING)
        if status_f != "all":
            if status_f not in dict(Payment.STATUS_CHOICES):
                raise NotFound("Անհայտ status")
            qs = qs.filter(status=status_f)
        return qs

    def post(self, request):
        serializer = AdminPaymentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment_id = serializer.validated_data["payment_id"]
        action = serializer.validated_data["action"]
        if not Payment.objects.filter(pk=payment_id).exists():
            raise NotFound("Վճարումը չի գտնվել")
        try:
            if action == "approve":
                payment = approve_payment(payment_id, reviewer=request.user)
            else:
                payment = reject_payment(payment_id, reviewer=request.user)
        except PaymentStateError as e:
            return Response({"error": str(e), "code": "invalid_state"}, status=status.HTTP_409_CONFLICT)
        logger.info("Admin %s %sd payment %s", request.user.username, action, payment_id)
        return Response({"ok": True, "payment": AdminPaymentSerializer(payment).data})


class AdminPaymentReceiptView(APIView):
    """Receipts are private uploads: streamed only to admins (never from a public /media URL)."""

    permission_classes = (IsAdminUser,)

    def get(self, request, payment_id: int):
        payment = get_object_or_404(Payment, pk=payment_id)
        if not payment.receipt:
            raise NotFound("Կտրոն չկա")
        try:
            fh = payment.receipt.open("rb")
        except FileNotFoundError:
            raise NotFound("Կտրոնի ֆայլը չի գտնվել")
        content_type = mimetypes.guess_type(payment.receipt.name)[0] or "application/octet-stream"
        response = FileResponse(fh, content_type=content_type)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class AdminPromoView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        counts = promo_counts()
        free = list(PromoCode.objects.filter(used_by__isnull=True).values_list("code", flat=True)[:100])
        return Response({**counts, "free_codes": free})

    def post(self, request):
        serializer = PromoGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = generate_promo_codes(serializer.validated_data["n"])
        logger.info("Admin %s generated %s promo codes", request.user.username, len(codes))
        return Response({"codes": codes}, status=status.HTTP_201_CREATED)


class AdminStatsView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        today = yerevan_today()
        active_subs = (
            Subscription.objects.filter(is_active=True).filter(Q(package_key="pkg_5") | Q(valid_date=today)).count()
        )
        app = AppSettings.get()
        return Response(
            {
                "promo": promo_counts(),
                "active_subscriptions": active_subs,
                "vip_members": VipMember.objects.count(),
                "pending_payments": Payment.objects.filter(status=Payment.STATUS_PENDING).count(),
                "unread_support": SupportTicket.objects.filter(is_read=False).count(),
                "checks_date": app.checks_date,
                "ready_packages": [k for k in ready_package_keys() if k != "pkg_vip"],
                "today": today,
            }
        )


class AdminCandidatesView(generics.ListCreateAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = SelectionCandidateSerializer

    def get_queryset(self):
        qs = SelectionCandidate.objects.all()
        active = self.request.query_params.get("active")
        if active in ("1", "true"):
            qs = qs.filter(active=True)
        elif active in ("0", "false"):
            qs = qs.filter(active=False)
        return qs


class AdminCandidateDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = SelectionCandidateSerializer
    queryset = SelectionCandidate.objects.all()
    http_method_names = ["get", "patch", "delete", "head", "options"]


class AdminRevenueView(APIView):
    """Approved payments (income) for the last N days, by package and by day (Yerevan time)."""

    permission_classes = (IsAdminUser,)

    def get(self, request):
        from datetime import datetime, time, timedelta
        from zoneinfo import ZoneInfo

        try:
            days = min(max(int(request.query_params.get("days", 30)), 1), 366)
        except ValueError:
            days = 30
        tz = ZoneInfo(settings.TIME_ZONE)
        today = timezone.localdate(timezone=tz)
        start = datetime.combine(today - timedelta(days=days - 1), time.min, tzinfo=tz)
        approved = Payment.objects.filter(status=Payment.STATUS_APPROVED, reviewed_at__gte=start)

        totals = approved.aggregate(amount=Sum("amount"), count=Count("id"))
        today_start = datetime.combine(today, time.min, tzinfo=tz)
        today_totals = approved.filter(reviewed_at__gte=today_start).aggregate(amount=Sum("amount"), count=Count("id"))
        by_package = [
            {"key": r["package_key"], "label": product_label(r["package_key"]),
             "count": r["count"], "amount": r["amount"] or 0}
            for r in approved.values("package_key").annotate(count=Count("id"), amount=Sum("amount")).order_by("-amount")
        ]
        per_day = {
            r["day"].isoformat(): {"count": r["count"], "amount": r["amount"] or 0}
            for r in approved.annotate(day=TruncDate("reviewed_at", tzinfo=tz))
            .values("day").annotate(count=Count("id"), amount=Sum("amount"))
        }
        by_day = []
        for i in range(days):
            d = (today - timedelta(days=days - 1 - i)).isoformat()
            by_day.append({"date": d, **per_day.get(d, {"count": 0, "amount": 0})})
        promo_used = PromoCode.objects.filter(used_at__gte=start).count()
        return Response(
            {
                "days": days,
                "total_amount": totals["amount"] or 0,
                "total_count": totals["count"],
                "today_amount": today_totals["amount"] or 0,
                "today_count": today_totals["count"],
                "promo_redemptions": promo_used,
                "by_package": by_package,
                "by_day": by_day,
            }
        )
