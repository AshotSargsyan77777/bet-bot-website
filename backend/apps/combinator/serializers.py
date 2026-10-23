from rest_framework import serializers

from apps.checks.constants import COMBO_TIERS
from apps.combinator.models import ComboOrder

MARKETS = [
    "MATCH_WINNER",
    "DOUBLE_CHANCE",
    "DNB",
    "BTTS",
    "OU",
    "TEAM_TOTAL_HOME",
    "TEAM_TOTAL_AWAY",
    "OU_1H",
    "ODD_EVEN",
    "CLEAN_SHEET_HOME",
    "CLEAN_SHEET_AWAY",
    "WIN_TO_NIL_HOME",
    "WIN_TO_NIL_AWAY",
    "CORNERS_OU",
    "CORNERS_HOME",
    "CORNERS_AWAY",
    "CARDS_OU",
]


class ComboSearchSerializer(serializers.Serializer):
    """Combinator: a paid tier (fixed total odds range) and the exact number of matches.
    The upper limit is the number of matches available today (checked in the view)."""

    tier = serializers.ChoiceField(choices=list(COMBO_TIERS))
    legs = serializers.IntegerField(min_value=1, max_value=60)


class ComboOrderCreateSerializer(serializers.Serializer):
    tier = serializers.ChoiceField(choices=list(COMBO_TIERS))
    receipt = serializers.ImageField()

    def validate_receipt(self, value):
        from apps.commerce.serializers import PaymentCreateSerializer

        return PaymentCreateSerializer().validate_receipt(value)


class ComboOrderSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    body_text = serializers.SerializerMethodField()

    class Meta:
        model = ComboOrder
        fields = ("id", "tier", "label", "price", "valid_date", "body_text", "status", "created_at", "paid_at")

    def get_body_text(self, obj):
        # only single-variant orders made before tier purchases carry their own text
        return obj.body_text if obj.status == obj.STATUS_PAID else ""
