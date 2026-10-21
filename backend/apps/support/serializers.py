from rest_framework import serializers

from apps.support.models import SupportTicket


class SupportTicketSerializer(serializers.ModelSerializer):
    message = serializers.CharField(max_length=4000, trim_whitespace=True)

    class Meta:
        model = SupportTicket
        fields = ("id", "message", "created_at", "reply", "replied_at")
        read_only_fields = ("id", "created_at", "reply", "replied_at")


class AdminSupportTicketSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source="user.username", read_only=True)
    replied_by = serializers.CharField(source="replied_by.username", read_only=True, default=None)
    reply = serializers.CharField(max_length=4000, required=False, allow_blank=False, trim_whitespace=True)

    class Meta:
        model = SupportTicket
        fields = ("id", "user", "user_id", "message", "created_at", "is_read", "reply", "replied_at", "replied_by")
        read_only_fields = ("id", "user", "user_id", "message", "created_at", "replied_at", "replied_by")
