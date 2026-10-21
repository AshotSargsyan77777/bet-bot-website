from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.games.football_api import team_last_fixtures
from apps.games.models import TeamFormSnapshot

VENUES = ("all", "home", "away")


def _summarize(team_id: int, team_name: str, last_n: int, venue_filter: str, snap: dict) -> dict:
    played = snap["wins"] + snap["draws"] + snap["losses"]

    def pct(n):
        return round(n / played * 100, 1) if played else 0

    return {
        "team_id": team_id,
        "team_name": team_name,
        "last_n": last_n,
        "venue_filter": venue_filter,
        "wins": snap["wins"],
        "draws": snap["draws"],
        "losses": snap["losses"],
        "goals_for": snap["goals_for"],
        "goals_against": snap["goals_against"],
        "win_pct": pct(snap["wins"]),
        "avg_goals_for": round(snap["goals_for"] / played, 2) if played else 0,
        "avg_goals_against": round(snap["goals_against"] / played, 2) if played else 0,
        "btts_rate": pct(snap["btts_count"]),
        "clean_sheet_rate": pct(snap["clean_sheets"]),
        "matches": snap["matches_json"],
    }


def _compute_from_api(team_id: int, last_n: int, venue_filter: str) -> dict:
    venue = venue_filter if venue_filter in ("home", "away") else None
    matches = team_last_fixtures(team_id, last=last_n, venue=venue)
    out = {"wins": 0, "draws": 0, "losses": 0, "goals_for": 0, "goals_against": 0, "btts_count": 0, "clean_sheets": 0}
    simplified = []

    for m in matches:
        teams = m.get("teams") or {}
        goals = m.get("goals") or {}
        home = teams.get("home") or {}
        away = teams.get("away") or {}
        gh = goals.get("home")
        ga_m = goals.get("away")
        if gh is None or ga_m is None:
            continue
        is_home = home.get("id") == team_id
        my_g = gh if is_home else ga_m
        opp_g = ga_m if is_home else gh
        out["goals_for"] += my_g
        out["goals_against"] += opp_g
        if my_g > opp_g:
            out["wins"] += 1
        elif my_g < opp_g:
            out["losses"] += 1
        else:
            out["draws"] += 1
        if gh > 0 and ga_m > 0:
            out["btts_count"] += 1
        if opp_g == 0:
            out["clean_sheets"] += 1
        simplified.append(
            {
                "date": (m.get("fixture") or {}).get("date"),
                "home": home.get("name"),
                "away": away.get("name"),
                "score": f"{gh}-{ga_m}",
                "venue": "home" if is_home else "away",
            }
        )
    out["matches_json"] = simplified
    return out


def aggregate_form(team_id: int, team_name: str, last_n: int = 5, venue_filter: str = "all") -> dict:
    """Team form over the last N matches; persisted in TeamFormSnapshot and reused until it goes stale."""
    venue_filter = venue_filter if venue_filter in VENUES else "all"
    fresh_after = timezone.now() - timedelta(minutes=settings.FORM_STATS_TTL_MINUTES)
    snapshot = TeamFormSnapshot.objects.filter(
        team_id=team_id, last_n=last_n, venue_filter=venue_filter, fetched_at__gte=fresh_after
    ).first()
    if snapshot:
        data = {
            f: getattr(snapshot, f)
            for f in ("wins", "draws", "losses", "goals_for", "goals_against", "btts_count", "clean_sheets", "matches_json")
        }
        return _summarize(team_id, team_name or snapshot.team_name, last_n, venue_filter, data)

    data = _compute_from_api(team_id, last_n, venue_filter)
    TeamFormSnapshot.objects.update_or_create(
        team_id=team_id,
        last_n=last_n,
        venue_filter=venue_filter,
        defaults={"team_name": team_name or "", **data},
    )
    return _summarize(team_id, team_name, last_n, venue_filter, data)


def form_slice(form: dict) -> dict:
    """Compact version stored on fixtures for list views."""
    keys = ("win_pct", "avg_goals_for", "avg_goals_against", "btts_rate", "clean_sheet_rate", "wins", "draws", "losses")
    return {k: form.get(k) for k in keys}
