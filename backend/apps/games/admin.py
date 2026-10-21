from django.contrib import admin

from .models import FixtureCache, TeamFormSnapshot


@admin.register(FixtureCache)
class FixtureCacheAdmin(admin.ModelAdmin):
    list_display = ("api_fixture_id", "league_name", "home_team_name", "away_team_name", "kickoff", "status_short")
    list_filter = ("status_short",)
    search_fields = ("home_team_name", "away_team_name", "league_name")
    exclude = ("raw_json",)


@admin.register(TeamFormSnapshot)
class TeamFormSnapshotAdmin(admin.ModelAdmin):
    list_display = ("team_name", "team_id", "last_n", "venue_filter", "wins", "draws", "losses", "fetched_at")
    search_fields = ("team_name",)
