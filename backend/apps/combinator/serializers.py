from rest_framework import serializers

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


class CombinatorSearchSerializer(serializers.Serializer):
    target_odds_min = serializers.FloatField(min_value=1.01, max_value=10000, default=1.01)
    target_odds_max = serializers.FloatField(min_value=1.01, max_value=10000, default=100)
    legs_count = serializers.IntegerField(min_value=1, max_value=20, required=False, allow_null=True)
    legs_min = serializers.IntegerField(min_value=1, max_value=20, required=False, allow_null=True)
    legs_max = serializers.IntegerField(min_value=1, max_value=20, required=False, allow_null=True)
    leg_odds_min = serializers.FloatField(min_value=1.0, max_value=1000, default=1.01)
    leg_odds_max = serializers.FloatField(min_value=1.0, max_value=1000, default=50)
    markets = serializers.ListField(
        child=serializers.CharField(max_length=64), required=False, allow_empty=True, max_length=len(MARKETS)
    )
    max_results = serializers.IntegerField(min_value=1, max_value=20, default=20)

    def validate(self, attrs):
        if attrs["target_odds_min"] > attrs["target_odds_max"]:
            raise serializers.ValidationError("Min ընդհանուր գործակիցը չի կարող մեծ լինել max-ից")
        if attrs["leg_odds_min"] > attrs["leg_odds_max"]:
            raise serializers.ValidationError("Ողի min գործակիցը չի կարող մեծ լինել max-ից")
        lmin, lmax = attrs.get("legs_min"), attrs.get("legs_max")
        if lmin and lmax and lmin > lmax:
            raise serializers.ValidationError("legs_min > legs_max")
        return attrs
