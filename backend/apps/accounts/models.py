from django.conf import settings
from django.db import models


class TelegramAccount(models.Model):
    """Telegram identity linked to a site user (login widget + notifications)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="telegram")
    telegram_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=64, blank=True, default="")
    first_name = models.CharField(max_length=128, blank=True, default="")
    photo_url = models.URLField(max_length=500, blank=True, default="")
    notifications = models.BooleanField(default=True)
    linked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} ↔ tg:{self.telegram_id}"
