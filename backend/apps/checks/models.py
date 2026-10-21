from django.db import models

from .constants import DEFAULT_TEXT, N8N_KEYS, PACKAGES, UNAVAILABLE_TEXT


class AppSettings(models.Model):
    """Singleton app settings."""

    current_promo = models.CharField(max_length=32, default="SHOT5")
    promo_count = models.IntegerField(default=0)
    checks_date = models.CharField(max_length=10, blank=True, null=True)
    promo_from_3x = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "App settings"

    @classmethod
    def get(cls) -> "AppSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class DailyCheck(models.Model):
    package_key = models.CharField(max_length=32, unique=True, choices=[(k, k) for k in PACKAGES])
    body_text = models.TextField(blank=True, default="")
    selections_json = models.JSONField(default=list, blank=True)
    is_available = models.BooleanField(default=False)
    combined_odds = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quality = models.CharField(max_length=16, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def ensure_defaults(cls):
        existing = set(cls.objects.values_list("package_key", flat=True))
        for key in PACKAGES:
            if key in existing:
                continue
            label = PACKAGES[key]["label"]
            default_body = f"{label} չեկը {DEFAULT_TEXT}"
            cls.objects.get_or_create(
                package_key=key,
                defaults={"body_text": default_body, "is_available": False},
            )

    def unavailable_text(self) -> str:
        return f"{PACKAGES[self.package_key]['label']} չեկը {UNAVAILABLE_TEXT}"

    @property
    def is_n8n_key(self) -> bool:
        return self.package_key in N8N_KEYS
