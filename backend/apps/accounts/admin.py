from django.contrib import admin

from .models import TelegramAccount


@admin.register(TelegramAccount)
class TelegramAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "telegram_id", "username", "notifications", "linked_at")
    search_fields = ("user__username", "username", "telegram_id")
