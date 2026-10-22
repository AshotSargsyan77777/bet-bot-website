import logging

from celery import shared_task
from django.utils import timezone

from apps.checks.services.time import yerevan_today
from apps.games.football_api import FootballApiError, fixtures_by_date, parse_kickoff
from apps.games.form_stats import aggregate_form, form_slice
from apps.games.models import FixtureCache

logger = logging.getLogger(__name__)


@shared_task
def sync_fixtures_for_date(date: str | None = None):
    date = date or yerevan_today()
    try:
        items = fixtures_by_date(date)
    except FootballApiError as e:
        logger.warning("Fixture sync for %s failed: %s", date, e)
        return {"error": str(e), "date": date}
    count = 0
    for m in items:
        fi = m.get("fixture") or {}
        fid = fi.get("id")
        if not fid:
            continue
        league = m.get("league") or {}
        teams = m.get("teams") or {}
        goals = m.get("goals") or {}
        FixtureCache.objects.update_or_create(
            api_fixture_id=fid,
            defaults={
                "league_id": league.get("id"),
                "league_name": league.get("name") or "",
                "home_team_id": (teams.get("home") or {}).get("id"),
                "away_team_id": (teams.get("away") or {}).get("id"),
                "home_team_name": (teams.get("home") or {}).get("name") or "",
                "away_team_name": (teams.get("away") or {}).get("name") or "",
                "kickoff": parse_kickoff(m),
                "status_short": (fi.get("status") or {}).get("short") or "",
                "goals_home": goals.get("home"),
                "goals_away": goals.get("away"),
                "raw_json": m,
            },
        )
        count += 1
    logger.info("Fixture sync for %s: %s fixtures", date, count)
    return {"date": date, "synced": count}


def compute_fixture_form(fixture: FixtureCache) -> bool:
    """Store last-5 form of both teams on the fixture. Returns False when the API call fails."""
    if not (fixture.home_team_id and fixture.away_team_id):
        return False
    try:
        home = aggregate_form(fixture.home_team_id, fixture.home_team_name, 5, "all")
        away = aggregate_form(fixture.away_team_id, fixture.away_team_name, 5, "all")
    except FootballApiError as e:
        logger.info("Form stats for fixture %s unavailable: %s", fixture.api_fixture_id, e)
        return False
    fixture.home_form = form_slice(home)
    fixture.away_form = form_slice(away)
    fixture.home_win_pct = home["win_pct"]
    fixture.away_win_pct = away["win_pct"]
    fixture.form_diff = round(home["win_pct"] - away["win_pct"], 1)
    fixture.stats_computed_at = timezone.now()
    fixture.save(
        update_fields=["home_form", "away_form", "home_win_pct", "away_win_pct", "form_diff", "stats_computed_at"]
    )
    return True


@shared_task
def compute_form_for_date(date: str | None = None, limit: int = 200):
    date = date or yerevan_today()
    pending = FixtureCache.objects.filter(kickoff__date=date, stats_computed_at__isnull=True).site_leagues()[:limit]
    done = sum(1 for f in pending if compute_fixture_form(f))
    return {"date": date, "computed": done}
