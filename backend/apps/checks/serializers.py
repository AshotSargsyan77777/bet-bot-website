from rest_framework import serializers

from apps.checks.constants import PACKAGES
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready, get_check_display_text


class CatalogItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    price = serializers.IntegerField()
    ready = serializers.BooleanField()
    purchasable = serializers.BooleanField()


class DailyCheckSerializer(serializers.ModelSerializer):
    ready = serializers.SerializerMethodField()
    display_text = serializers.SerializerMethodField()

    class Meta:
        model = DailyCheck
        fields = (
            "package_key",
            "ready",
            "display_text",
            "combined_odds",
            "quality",
            "selections_json",
            "updated_at",
        )

    def get_ready(self, obj):
        return check_is_ready(obj)

    def get_display_text(self, obj):
        return get_check_display_text(obj)


def build_catalog():
    from apps.checks.constants import PURCHASABLE_KEYS

    items = []
    for key, meta in PACKAGES.items():
        check = DailyCheck.objects.filter(package_key=key).first()
        ready = check_is_ready(check) if check else False
        items.append(
            {
                "key": key,
                "label": meta["label"],
                "price": meta["price"],
                "ready": ready,
                "purchasable": key in PURCHASABLE_KEYS and key != "pkg_vip",
            }
        )
    return items
