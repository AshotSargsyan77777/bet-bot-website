import logging

from django.utils import timezone
from rest_framework import generics
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsAdminUser
from apps.support.models import SupportTicket
from apps.support.serializers import AdminSupportTicketSerializer, SupportTicketSerializer

logger = logging.getLogger(__name__)


class SupportTicketListCreateView(generics.ListCreateAPIView):
    serializer_class = SupportTicketSerializer

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "support"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        return SupportTicket.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        ticket = serializer.save(user=self.request.user)
        logger.info("Support ticket %s created by %s", ticket.id, self.request.user.username)


class AdminSupportView(generics.ListAPIView):
    permission_classes = (IsAdminUser,)
    serializer_class = AdminSupportTicketSerializer

    def get_queryset(self):
        qs = SupportTicket.objects.select_related("user", "replied_by")
        state = self.request.query_params.get("state")
        if state == "unread":
            qs = qs.filter(is_read=False)
        elif state == "unanswered":
            qs = qs.filter(reply="")
        return qs


class AdminSupportDetailView(generics.RetrieveUpdateAPIView):
    """PATCH {"reply": "..."} answers the ticket (bot's /reply); PATCH {"is_read": true} marks it read."""

    permission_classes = (IsAdminUser,)
    serializer_class = AdminSupportTicketSerializer
    queryset = SupportTicket.objects.select_related("user", "replied_by")
    http_method_names = ["get", "patch", "head", "options"]

    def perform_update(self, serializer):
        extra = {}
        if "reply" in serializer.validated_data:
            extra = {"replied_at": timezone.now(), "replied_by": self.request.user, "is_read": True}
        serializer.save(**extra)
