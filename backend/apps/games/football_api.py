import logging
from datetime import datetime
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://v3.football.api-sports.io"


class FootballApiError(Exception):
    pass


def _headers() -> dict:
    key = settings.API_FOOTBALL_KEY
    if not key:
        raise FootballApiError("API_FOOTBALL_KEY not configured")
    return {"x-apisports-key": key}


def _get(path: str, params: dict | None = None, cache_ttl: int = 300) -> Any:
    params = params or {}
    cache_key = f"apifootball:{path}:{sorted(params.items())}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    url = f"{BASE_URL}{path}"
    r = requests.get(url, headers=_headers(), params=params, timeout=30)
    if r.status_code != 200:
        raise FootballApiError(f"HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    if data.get("errors"):
        raise FootballApiError(str(data["errors"]))
    cache.set(cache_key, data, cache_ttl)
    return data


def fixtures_by_date(date: str, league: int | None = None, status: str | None = None) -> list:
    params: dict[str, Any] = {"date": date}
    if league:
        params["league"] = league
    if status:
        params["status"] = status
    data = _get("/fixtures", params, cache_ttl=120)
    return data.get("response") or []


def fixture_by_id(fixture_id: int) -> dict | None:
    data = _get("/fixtures", {"id": fixture_id}, cache_ttl=60)
    resp = data.get("response") or []
    return resp[0] if resp else None


def team_last_fixtures(team_id: int, last: int = 5, venue: str | None = None) -> list:
    params: dict[str, Any] = {"team": team_id, "last": last}
    if venue in ("home", "away"):
        params["venue"] = venue
    data = _get("/fixtures", params, cache_ttl=600)
    return data.get("response") or []


def head_to_head(team1: int, team2: int, last: int = 5) -> list:
    data = _get("/fixtures/headtohead", {"h2h": f"{team1}-{team2}", "last": last}, cache_ttl=600)
    return data.get("response") or []


def parse_kickoff(fixture: dict) -> datetime:
    from django.utils.dateparse import parse_datetime

    fi = fixture.get("fixture") or {}
    dt = parse_datetime(fi.get("date", ""))
    if dt is None:
        return datetime.utcnow()
    return dt
