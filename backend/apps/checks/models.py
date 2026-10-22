from django.db import models

from .constants import DEFAULT_TEXT, N8N_KEYS, PACKAGES, UNAVAILABLE_TEXT


class AppSettings(models.Model):
    """Singleton app settings."""

    current_promo = models.CharField(max_length=32, default="SHOT5")
    promo_count = models.IntegerField(default=0)
    checks_date = models.CharField(max_length=10, blank=True, null=True)
    promo_from_3x = models.BooleanField(default=False)
    # day (Yerevan) for which the "today's checks are ready" Telegram broadcast was already sent
    ready_notified_date = models.CharField(max_length=10, blank=True, null=True)

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
    current_record = models.ForeignKey(
        "CheckRecord", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
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


class CheckRecord(models.Model):
    """Every published version of a daily check, kept for the public archive and win/loss statistics."""

    STATUS_PENDING = "pending"
    STATUS_WON = "won"
    STATUS_LOST = "lost"
    STATUS_VOID = "void"
    STATUS_CHOICES = [(STATUS_PENDING, "pending"), (STATUS_WON, "won"), (STATUS_LOST, "lost"), (STATUS_VOID, "void")]

    package_key = models.CharField(max_length=32, choices=[(k, k) for k in PACKAGES])
    date = models.CharField(max_length=10, db_index=True)  # Yerevan "day" (02:00 boundary)
    content_hash = models.CharField(max_length=64)
    body_text = models.TextField()
    selections_json = models.JSONField(default=list, blank=True)
    combined_odds = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quality = models.CharField(max_length=16, blank=True, default="")
    # True for the last version published that day; earlier versions stay in history only if someone bought them
    is_final = models.BooleanField(default=True)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    legs_result = models.JSONField(default=list, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    settled_manually = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "package_key", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["package_key", "date", "content_hash"], name="unique_check_version")
        ]

    @property
    def label(self) -> str:
        return PACKAGES.get(self.package_key, {}).get("label", self.package_key)
