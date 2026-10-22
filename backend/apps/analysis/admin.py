from django.contrib import admin

from apps.analysis.models import AnalysisOrder, MatchAnalysis


@admin.register(MatchAnalysis)
class MatchAnalysisAdmin(admin.ModelAdmin):
    list_display = ("date", "home", "away", "league_id", "created_at")
    list_filter = ("date",)


@admin.register(AnalysisOrder)
class AnalysisOrderAdmin(admin.ModelAdmin):
    list_display = ("user", "analysis", "price", "status", "created_at")
    list_filter = ("status",)
