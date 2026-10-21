from django.contrib import admin

from .models import AppSettings, DailyCheck


@admin.register(DailyCheck)
class DailyCheckAdmin(admin.ModelAdmin):
    list_display = ("package_key", "is_available", "updated_at")


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ("checks_date", "current_promo", "promo_count")
