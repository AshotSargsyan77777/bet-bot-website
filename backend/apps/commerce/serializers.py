from rest_framework import serializers

from apps.commerce.models import Payment, PromoCode, SelectionCandidate


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("id", "package_key", "status", "created_at", "reviewed_at")
        read_only_fields = fields


class PaymentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("package_key", "receipt")


class PromoRedeemSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


class SelectionCandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SelectionCandidate
        fields = "__all__"
