from django.conf import settings
from django.db import models


class SupportTicket(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_tickets")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    reply = models.TextField(blank=True, default="")
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="support_replies"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["is_read", "-created_at"], name="support_unread_idx")]
