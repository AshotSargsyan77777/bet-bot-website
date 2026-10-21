from django.contrib import admin

from .models import SupportTicket


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "created_at", "is_read", "replied_at")
    list_filter = ("is_read",)
    search_fields = ("user__username", "message")
