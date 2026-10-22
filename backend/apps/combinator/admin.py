from django.contrib import admin

from .models import ComboOrder


@admin.register(ComboOrder)
class ComboOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "tier", "price", "combined_odds", "status", "created_at", "paid_at")
    list_filter = ("status", "tier")
    search_fields = ("user__username",)
