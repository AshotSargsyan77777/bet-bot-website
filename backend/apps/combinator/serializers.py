from rest_framework import serializers

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
    """VIP combinator search: total odds range and the maximum number of games."""

    target_odds_min = serializers.FloatField(min_value=1.5, max_value=21)
    target_odds_max = serializers.FloatField(min_value=1.5, max_value=21)
    max_legs = serializers.IntegerField(min_value=2, max_value=12, default=7)

    def validate(self, attrs):
        if attrs["target_odds_min"] > attrs["target_odds_max"]:
            raise serializers.ValidationError("Ընդհանուր գործակցի «սկսած»-ը չի կարող մեծ լինել «մինչև»-ից")
        return attrs


class ComboOrderCreateSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=4000)
    receipt = serializers.ImageField()

    def validate_receipt(self, value):
        from apps.commerce.serializers import PaymentCreateSerializer

        return PaymentCreateSerializer().validate_receipt(value)


class ComboOrderSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    legs = serializers.SerializerMethodField()
    body_text = serializers.SerializerMethodField()
    legs_count = serializers.SerializerMethodField()

    class Meta:
        model = ComboOrder
        fields = ("id", "tier", "label", "price", "combined_odds", "hit_chance", "legs_count", "legs", "body_text",
                  "status", "created_at", "paid_at")

    def _paid(self, obj):
        return obj.status == obj.STATUS_PAID

    def get_legs(self, obj):
        return obj.legs if self._paid(obj) else []  # picks stay hidden until the payment is approved

    def get_body_text(self, obj):
        return obj.body_text if self._paid(obj) else ""

    def get_legs_count(self, obj):
        return len(obj.legs)
