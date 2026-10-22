from django.conf import settings
from django.db import models

from apps.checks.constants import COMBO_TIERS


class ComboOrder(models.Model):
    """A VIP user's purchase of a combinator tier for one day: once paid, all of that day's variants open.

    Orders made before tier purchases hold a single variant in `legs`/`body_text`.
    """

    STATUS_PENDING = "pending"
    STATUS_PAID = "paid"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [(STATUS_PENDING, "pending"), (STATUS_PAID, "paid"), (STATUS_REJECTED, "rejected")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="combo_orders")
    tier = models.CharField(max_length=16, choices=[(k, k) for k in COMBO_TIERS])
    price = models.PositiveIntegerField()
    valid_date = models.CharField(max_length=10, blank=True, default="", db_index=True)  # Yerevan day
    combined_odds = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    hit_chance = models.FloatField(null=True, blank=True)  # product of leg probabilities, when known
    legs = models.JSONField(default=list)
    body_text = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def label(self) -> str:
        return COMBO_TIERS[self.tier]["label"]


class CombinatorPool(models.Model):
    """Analysed picks n8n sends for the combinator only (they never become checks); one row per Yerevan day."""

    date = models.CharField(max_length=10, unique=True)
    selections = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)
