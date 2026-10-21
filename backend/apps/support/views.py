from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminUser
from apps.support.models import SupportTicket


class SupportTicketCreateView(APIView):
    def post(self, request):
        message = (request.data.get("message") or "").strip()
        if not message:
            return Response({"error": "message required"}, status=400)
        SupportTicket.objects.create(user=request.user, message=message)
        return Response({"ok": True})


class AdminSupportView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        tickets = SupportTicket.objects.select_related("user").order_by("-created_at")[:50]
        return Response(
            [
                {
                    "id": t.id,
                    "user": t.user.username,
                    "user_id": t.user_id,
                    "message": t.message,
                    "created_at": t.created_at,
                    "is_read": t.is_read,
                }
                for t in tickets
            ]
        )
