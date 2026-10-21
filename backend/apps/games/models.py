from django.db import models


class FixtureCache(models.Model):
    api_fixture_id = models.IntegerField(unique=True, db_index=True)
    league_id = models.IntegerField(null=True, blank=True)
    league_name = models.CharField(max_length=255, blank=True, default="")
    home_team_id = models.IntegerField(null=True, blank=True)
    away_team_id = models.IntegerField(null=True, blank=True)
    home_team_name = models.CharField(max_length=255)
    away_team_name = models.CharField(max_length=255)
    kickoff = models.DateTimeField()
    status_short = models.CharField(max_length=16, blank=True, default="")
    goals_home = models.IntegerField(null=True, blank=True)
    goals_away = models.IntegerField(null=True, blank=True)
    raw_json = models.JSONField(default=dict, blank=True)
    # Last-5 form summaries, stored so list filtering/sorting by form runs in the database.
    home_form = models.JSONField(null=True, blank=True)
    away_form = models.JSONField(null=True, blank=True)
    home_win_pct = models.FloatField(null=True, blank=True)
    away_win_pct = models.FloatField(null=True, blank=True)
    form_diff = models.FloatField(null=True, blank=True)
    stats_computed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kickoff"]
        indexes = [models.Index(fields=["kickoff"], name="fixture_kickoff_idx")]


class TeamFormSnapshot(models.Model):
    team_id = models.IntegerField(db_index=True)
    team_name = models.CharField(max_length=255, blank=True, default="")
    last_n = models.IntegerField(default=5)
    venue_filter = models.CharField(max_length=16, blank=True, default="all")  # all, home, away
    wins = models.IntegerField(default=0)
    draws = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)
    goals_for = models.IntegerField(default=0)
    goals_against = models.IntegerField(default=0)
    btts_count = models.IntegerField(default=0)
    clean_sheets = models.IntegerField(default=0)
    matches_json = models.JSONField(default=list, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("team_id", "last_n", "venue_filter")
