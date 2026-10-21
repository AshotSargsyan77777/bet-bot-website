from celery import shared_task

from apps.games.football_api import fixtures_by_date, parse_kickoff
from apps.games.models import FixtureCache
from apps.checks.services.time import yerevan_today


@shared_task
def sync_fixtures_for_date(date: str | None = None):
    date = date or yerevan_today()
    try:
        items = fixtures_by_date(date)
    except Exception:
        return {"error": "api_failed", "date": date}
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
    return {"date": date, "synced": count}
