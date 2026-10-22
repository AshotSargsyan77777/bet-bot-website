from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from apps.checks.constants import PURCHASABLE_KEYS, product_label
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.commerce.models import Payment, SelectionCandidate

ALLOWED_RECEIPT_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


class PaymentSerializer(serializers.ModelSerializer):
    package_label = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ("id", "package_key", "package_label", "status", "created_at", "reviewed_at")
        read_only_fields = fields

    def get_package_label(self, obj):
        return product_label(obj.package_key)


class PaymentCreateSerializer(serializers.ModelSerializer):
    package_key = serializers.ChoiceField(choices=PURCHASABLE_KEYS)

    class Meta:
        model = Payment
        fields = ("id", "package_key", "receipt", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")
        extra_kwargs = {"receipt": {"write_only": True}}

    def validate_package_key(self, value):
        if value != "pkg_vip":
            check = DailyCheck.objects.filter(package_key=value).first()
            if not check or not check_is_ready(check):
                raise serializers.ValidationError("Այս փաթեթի չեկը այսօր հասանելի չէ")
        return value

    def validate_receipt(self, value):
        if value.size > settings.RECEIPT_MAX_BYTES:
            raise serializers.ValidationError(
                f"Նկարը չափազանց մեծ է (max {settings.RECEIPT_MAX_BYTES // (1024 * 1024)} MB)"
            )
        image = getattr(value, "image", None)
        fmt = getattr(image, "format", None)
        if fmt and fmt.upper() not in ALLOWED_RECEIPT_FORMATS:
            raise serializers.ValidationError("Թույլատրված են միայն JPEG, PNG, WEBP, GIF նկարներ")
        return value


class AdminPaymentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    package_label = serializers.SerializerMethodField()
    receipt_url = serializers.SerializerMethodField()
    reviewed_by = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = (
            "id",
            "user_id",
            "username",
            "package_key",
            "package_label",
            "status",
            "receipt_url",
            "created_at",
            "reviewed_at",
            "reviewed_by",
        )

    def get_package_label(self, obj):
        return product_label(obj.package_key)

    def get_receipt_url(self, obj):
        return f"/api/admin/payments/{obj.id}/receipt/" if obj.receipt else None


class AdminPaymentActionSerializer(serializers.Serializer):
    payment_id = serializers.IntegerField(min_value=1)
    action = serializers.ChoiceField(choices=["approve", "reject"])


class PromoRedeemSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, trim_whitespace=True)


class PromoGenerateSerializer(serializers.Serializer):
    n = serializers.IntegerField(min_value=1, max_value=50, default=1)


class SelectionCandidateSerializer(serializers.ModelSerializer):
    odd = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal("1.01"), max_value=Decimal("1000"), coerce_to_string=False)
    reasons = serializers.ListField(child=serializers.CharField(max_length=500), required=False, max_length=20)

    class Meta:
        model = SelectionCandidate
        fields = ("id", "fixture_name", "fixture_id", "market", "selection", "odd", "reasons", "active", "created_at")
        read_only_fields = ("id", "created_at")
