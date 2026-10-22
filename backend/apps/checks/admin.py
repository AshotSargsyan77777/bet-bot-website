from django.contrib import admin

from .models import AppSettings, CheckRecord, DailyCheck


@admin.register(DailyCheck)
class DailyCheckAdmin(admin.ModelAdmin):
    list_display = ("package_key", "is_available", "updated_at")


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ("checks_date", "current_promo", "promo_count")


@admin.register(CheckRecord)
class CheckRecordAdmin(admin.ModelAdmin):
    list_display = ("date", "package_key", "status", "is_final", "combined_odds", "settled_at")
    list_filter = ("status", "package_key", "is_final")
    search_fields = ("date", "body_text")
