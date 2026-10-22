from django.conf import settings
from django.db import models


class MatchAnalysis(models.Model):
    """n8n's full analysis of one match for a Yerevan day (all markets, independent of bookmaker odds)."""

    date = models.CharField(max_length=10, db_index=True)
    fixture_id = models.IntegerField()
    league_id = models.IntegerField(null=True, blank=True)
    home = models.CharField(max_length=120)
    away = models.CharField(max_length=120)
    report = models.JSONField(default=dict)
    picks = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["date", "fixture_id"], name="one_analysis_per_fixture_day")]

    def __str__(self):
        return f"{self.date} {self.home} - {self.away}"


class AnalysisOrder(models.Model):
    """A user's purchase of one match analysis (opened once the payment is approved)."""

    STATUS_PENDING = "pending"
    STATUS_PAID = "paid"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [(STATUS_PENDING, "pending"), (STATUS_PAID, "paid"), (STATUS_REJECTED, "rejected")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="analysis_orders")
    analysis = models.ForeignKey(MatchAnalysis, on_delete=models.CASCADE, related_name="orders")
    price = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
