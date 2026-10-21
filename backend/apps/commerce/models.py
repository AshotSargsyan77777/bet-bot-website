from django.conf import settings
from django.db import models

from apps.checks.constants import PACKAGES


class Subscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions")
    package_key = models.CharField(max_length=32, choices=[(k, k) for k in PACKAGES])
    valid_date = models.CharField(max_length=10, blank=True, null=True)
    snapshot_text = models.TextField(blank=True, default="")
    from_promo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]


class PromoCode(models.Model):
    code = models.CharField(max_length=8, unique=True, db_index=True)
    created_date = models.CharField(max_length=10)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="used_promos"
    )
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]


class Payment(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "pending"),
        (STATUS_APPROVED, "approved"),
        (STATUS_REJECTED, "rejected"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payments")
    package_key = models.CharField(max_length=32, choices=[(k, k) for k in PACKAGES])
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    receipt = models.ImageField(upload_to="receipts/%Y/%m/")
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class VipMember(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vip")
    granted_at = models.DateTimeField(auto_now_add=True)


class SelectionCandidate(models.Model):
    """Admin-added outcomes for combinator pool."""

    fixture_name = models.CharField(max_length=255)
    fixture_id = models.CharField(max_length=64, blank=True, default="")
    market = models.CharField(max_length=64)
    selection = models.CharField(max_length=255)
    odd = models.DecimalField(max_digits=8, decimal_places=3)
    reasons = models.JSONField(default=list, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
