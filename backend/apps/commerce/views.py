from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser
from apps.checks.constants import PACKAGES, PURCHASABLE_KEYS
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.commerce.models import Payment, PromoCode, SelectionCandidate, Subscription, VipMember
from apps.commerce.promo import generate_promo_codes, promo_counts
from apps.commerce.serializers import PaymentCreateSerializer, PaymentSerializer, SelectionCandidateSerializer
from apps.commerce.services import approve_payment, get_active_subscription, redeem_promo, reject_payment


class PaymentListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        if self.request.method == "POST":
            return PaymentCreateSerializer
        return PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        pkg = serializer.validated_data["package_key"]
        if pkg not in PURCHASABLE_KEYS:
            raise ValidationError("invalid package")
        if pkg != "pkg_vip":
            check = DailyCheck.objects.filter(package_key=pkg).first()
            if not check or not check_is_ready(check):
                raise ValidationError("check not available today")
        Payment.objects.filter(user=self.request.user, status=Payment.STATUS_PENDING).update(
            status=Payment.STATUS_REJECTED
        )
        serializer.save(user=self.request.user, status=Payment.STATUS_PENDING)


class PromoRedeemView(APIView):
    def post(self, request):
        code = (request.data.get("code") or "").strip()
        ok, detail = redeem_promo(request.user, code)
        if not ok:
            messages = {
                "invalid": "❌ Սխալ կոդ",
                "used": "❌ Այս կոդն արդեն օգտագործված է",
                "already_subscribed": "✅ Դու արդեն ունես ակտիվ փաթեթ",
                "not_ready": "⏳ Պրոմո չեկը այսօր դեռ պատրաստ չէ",
            }
            return Response({"ok": False, "message": messages.get(detail, detail)}, status=400)
        return Response({"ok": True, "package_key": detail})


class VipStatusView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        is_vip = False
        if request.user.is_authenticated:
            is_vip = VipMember.objects.filter(user=request.user).exists()
        return Response({"is_vip": is_vip, "link": settings.VIP_CHANNEL_LINK, "price": PACKAGES["pkg_vip"]["price"]})


class StatusView(APIView):
    def get(self, request):
        sub = get_active_subscription(request.user)
        pkg = PACKAGES.get(sub.package_key) if sub else None
        vip = VipMember.objects.filter(user=request.user).exists()
        return Response(
            {
                "has_active_check": bool(sub),
                "package": pkg,
                "package_key": sub.package_key if sub else None,
                "is_vip": vip,
            }
        )


class AdminPaymentsView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        pending = Payment.objects.filter(status=Payment.STATUS_PENDING).select_related("user")
        data = []
        for p in pending:
            data.append(
                {
                    "id": p.id,
                    "user_id": p.user_id,
                    "username": p.user.username,
                    "package_key": p.package_key,
                    "receipt_path": p.receipt.url if p.receipt else None,
                    "receipt_url": request.build_absolute_uri(p.receipt.url) if p.receipt else None,
                    "created_at": p.created_at,
                }
            )
        return Response(data)

    def post(self, request):
        action = request.data.get("action")
        payment_id = request.data.get("payment_id")
        payment = Payment.objects.filter(id=payment_id).first()
        if not payment:
            return Response({"error": "not found"}, status=404)
        if action == "approve":
            if payment.package_key != "pkg_vip":
                check = DailyCheck.objects.filter(package_key=payment.package_key).first()
                if not check or not check_is_ready(check):
                    return Response({"error": "check not ready"}, status=400)
            approve_payment(payment)
        elif action == "reject":
            reject_payment(payment)
        else:
            return Response({"error": "invalid action"}, status=400)
        return Response({"ok": True})


class AdminPromoView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        counts = promo_counts()
        free = list(PromoCode.objects.filter(used_by__isnull=True).values_list("code", flat=True)[:100])
        return Response({**counts, "free_codes": free})

    def post(self, request):
        n = min(max(int(request.data.get("n", 1)), 1), 50)
        codes = generate_promo_codes(n)
        return Response({"codes": codes})


class AdminStatsView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        from apps.checks.services.time import yerevan_today

        today = yerevan_today()
        active_subs = Subscription.objects.filter(is_active=True).count()
        ready = [c.package_key for c in DailyCheck.objects.all() if check_is_ready(c)]
        app = AppSettings.get()
        return Response(
            {
                "promo": promo_counts(),
                "active_subscriptions": active_subs,
                "vip_members": VipMember.objects.count(),
                "checks_date": app.checks_date,
                "ready_packages": ready,
                "today": today,
            }
        )


class AdminCandidatesView(generics.ListCreateAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = SelectionCandidateSerializer
    queryset = SelectionCandidate.objects.all()
