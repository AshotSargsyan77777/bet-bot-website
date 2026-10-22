from rest_framework import serializers

from apps.checks.constants import PACKAGES, PURCHASABLE_KEYS
from apps.checks.models import AppSettings, CheckRecord, DailyCheck
from apps.checks.services.checks_logic import check_is_ready, get_check_display_text


class DailyCheckSerializer(serializers.ModelSerializer):
    ready = serializers.SerializerMethodField()
    display_text = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()

    class Meta:
        model = DailyCheck
        fields = (
            "package_key",
            "label",
            "ready",
            "is_available",
            "body_text",
            "display_text",
            "combined_odds",
            "quality",
            "selections_json",
            "updated_at",
        )

    def get_ready(self, obj):
        return check_is_ready(obj, self.context.get("checks_date"))

    def get_display_text(self, obj):
        return get_check_display_text(obj)

    def get_label(self, obj):
        return PACKAGES[obj.package_key]["label"]


class AdminCheckUpdateSerializer(serializers.Serializer):
    package_key = serializers.ChoiceField(choices=list(PACKAGES))
    body_text = serializers.CharField(max_length=10000, trim_whitespace=True)
    is_available = serializers.BooleanField(default=True)


def build_catalog() -> list[dict]:
    checks_date = AppSettings.get().checks_date
    checks = {c.package_key: c for c in DailyCheck.objects.all()}
    items = []
    for key, meta in PACKAGES.items():
        check = checks.get(key)
        ready = check_is_ready(check, checks_date) if check else False
        items.append(
            {
                "key": key,
                "label": meta["label"],
                "price": meta["price"],
                "ready": ready,
                "combined_odds": check.combined_odds if (check and ready) else None,
                "purchasable": key in PURCHASABLE_KEYS,
            }
        )
    return items


class CheckRecordSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    legs = serializers.SerializerMethodField()

    class Meta:
        model = CheckRecord
        fields = ("id", "package_key", "label", "date", "combined_odds", "quality", "status", "body_text", "legs", "settled_at")

    def get_legs(self, obj):
        if obj.legs_result:
            return obj.legs_result
        return [
            {"fixture": s.get("fixture"), "market": s.get("market"), "selection": s.get("selection"),
             "odd": s.get("odd"), "result": "pending"}
            for s in obj.selections_json or []
        ]


class AdminRecordUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[c[0] for c in CheckRecord.STATUS_CHOICES])
