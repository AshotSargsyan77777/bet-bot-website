"""Automatic win/loss settlement of published checks using final match data from API-Football."""

import logging
import re
from datetime import datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.checks.models import CheckRecord
from apps.checks.services.time import yerevan_today
from apps.games.football_api import FootballApiError, fixture_statistics, fixtures_by_ids, is_configured
from apps.games.models import FixtureCache

logger = logging.getLogger(__name__)

WON, LOST, VOID, PENDING = "won", "lost", "void", "pending"
FINISHED = {"FT", "AET", "PEN"}
VOIDED = {"CANC", "ABD", "AWD", "WO"}
SETTLE_WINDOW_DAYS = 10
STATS_GRACE = timedelta(days=3)       # corners/cards: no statistics after this long → void
POSTPONED_GRACE = timedelta(hours=48)  # postponed match not played within 48h → void (bookmaker rule)


def _ou(value, kind: str, line: float) -> str:
    if value is None:
        return PENDING
    if value == line:
        return VOID
    over = kind.lower() == "over"
    return WON if (value > line) == over else LOST


def _line(selection: str):
    m = re.search(r"(Over|Under)\s+(\d+(?:\.\d+)?)", selection, re.I)
    return (m.group(1), float(m.group(2))) if m else (None, None)


def _stat_totals(response: list, home_id, away_id) -> dict | None:
    if not response:
        return None
    teams = {}
    for t in response:
        vals = {str(r.get("type", "")).lower(): r.get("value") for r in t.get("statistics") or []}

        def n(key):
            v = vals.get(key)
            try:
                return int(v) if v is not None else 0
            except (TypeError, ValueError):
                return 0

        teams[(t.get("team") or {}).get("id")] = {
            "corners": n("corner kicks"),
            "cards": n("yellow cards") + n("red cards"),
            "has_corners": vals.get("corner kicks") is not None,
        }
    h, a = teams.get(home_id), teams.get(away_id)
    if not h or not a or not (h["has_corners"] or a["has_corners"]):
        return None
    return {
        "corners": h["corners"] + a["corners"],
        "home_corners": h["corners"],
        "away_corners": a["corners"],
        "cards": h["cards"] + a["cards"],
    }


def evaluate_leg(leg: dict, fx: dict | None, stats_loader) -> str:
    """Result of one selection: won / lost / void / pending."""
    if not fx:
        return PENDING
    status = ((fx.get("fixture") or {}).get("status") or {}).get("short") or ""
    kickoff = parse_datetime((fx.get("fixture") or {}).get("date") or "")
    if status in VOIDED:
        return VOID
    if status == "PST":
        return VOID if kickoff and timezone.now() - kickoff > POSTPONED_GRACE else PENDING
    if status not in FINISHED:
        return PENDING

    score = fx.get("score") or {}
    ft = score.get("fulltime") or {}
    goals = fx.get("goals") or {}
    gh = ft.get("home") if ft.get("home") is not None else goals.get("home")
    ga = ft.get("away") if ft.get("away") is not None else goals.get("away")
    if gh is None or ga is None:
        return PENDING
    ht = score.get("halftime") or {}

    market = leg.get("market")
    sel = str(leg.get("selection") or "")
    home_name = str(leg.get("fixture") or "").split(" - ")[0]
    yes = bool(re.search(r"Yes$", sel, re.I))
    kind, line = _line(sel)

    if market == "MATCH_WINNER":
        if "(Home Win)" in sel:
            return WON if gh > ga else LOST
        return WON if ga > gh else LOST
    if market == "DOUBLE_CHANCE":
        name = re.sub(r" or Draw$", "", sel)
        home_side = name == home_name or name == ((fx.get("teams") or {}).get("home") or {}).get("name")
        return WON if (gh >= ga if home_side else ga >= gh) else LOST
    if market == "DNB":
        if gh == ga:
            return VOID
        name = re.sub(r"^Draw No Bet\s*—\s*", "", sel)
        home_side = name == home_name or name == ((fx.get("teams") or {}).get("home") or {}).get("name")
        return WON if (gh > ga) == home_side else LOST
    if market == "BTTS":
        both = gh > 0 and ga > 0
        return WON if both == yes else LOST
    if market == "OU" and kind:
        return _ou(gh + ga, kind, line)
    if market == "TEAM_TOTAL_HOME" and kind:
        return _ou(gh, kind, line)
    if market == "TEAM_TOTAL_AWAY" and kind:
        return _ou(ga, kind, line)
    if market == "OU_1H" and kind:
        if ht.get("home") is None or ht.get("away") is None:
            return PENDING
        return _ou(ht["home"] + ht["away"], kind, line)
    if market == "CLEAN_SHEET_HOME":
        return WON if (ga == 0) == yes else LOST
    if market == "CLEAN_SHEET_AWAY":
        return WON if (gh == 0) == yes else LOST
    if market == "WIN_TO_NIL_HOME":
        return WON if (gh > ga and ga == 0) == yes else LOST
    if market == "WIN_TO_NIL_AWAY":
        return WON if (ga > gh and gh == 0) == yes else LOST
    if market == "ODD_EVEN":
        odd = (gh + ga) % 2 == 1
        return WON if odd == sel.strip().lower().startswith("odd") else LOST
    if market in ("CORNERS_OU", "CORNERS_HOME", "CORNERS_AWAY", "CARDS_OU") and kind:
        stats = stats_loader(fx)
        if stats is None:
            return VOID if kickoff and timezone.now() - kickoff > STATS_GRACE else PENDING
        value = {
            "CORNERS_OU": stats["corners"],
            "CORNERS_HOME": stats["home_corners"],
            "CORNERS_AWAY": stats["away_corners"],
            "CARDS_OU": stats["cards"],
        }[market]
        return _ou(value, kind, line)
    return PENDING  # unknown market: admin settles manually


def combine(results: list[str]) -> str:
    if not results:
        return PENDING
    if LOST in results:
        return LOST
    if PENDING in results:
        return PENDING
    if all(r == VOID for r in results):
        return VOID
    return WON


def _fixture_id_for(leg: dict, record_date: str) -> int | None:
    fid = leg.get("fixture_id")
    try:
        return int(fid) if fid not in (None, "") else None
    except (TypeError, ValueError):
        pass
    # Older checks without fixture ids: match by team names in the fixtures cache
    parts = str(leg.get("fixture") or "").split(" - ")
    if len(parts) != 2:
        return None
    day = datetime.fromisoformat(record_date).date()
    f = FixtureCache.objects.filter(
        home_team_name__iexact=parts[0].strip(),
        away_team_name__iexact=parts[1].strip(),
        kickoff__date__gte=day - timedelta(days=1),
        kickoff__date__lte=day + timedelta(days=1),
    ).first()
    return f.api_fixture_id if f else None


def settle_pending_records(limit: int = 200) -> dict:
    if not is_configured():
        return {"ok": False, "error": "API_FOOTBALL_KEY not configured", "settled": 0}
    since = (datetime.fromisoformat(yerevan_today()) - timedelta(days=SETTLE_WINDOW_DAYS)).date().isoformat()
    records = list(
        CheckRecord.objects.filter(status=CheckRecord.STATUS_PENDING, settled_manually=False, date__gte=since)
        .exclude(selections_json=[])
        .order_by("date")[:limit]
    )
    leg_ids = {}
    for r in records:
        for i, leg in enumerate(r.selections_json or []):
            leg_ids[(r.pk, i)] = _fixture_id_for(leg, r.date)
    ids = {fid for fid in leg_ids.values() if fid}
    try:
        fixtures = {f["fixture"]["id"]: f for f in fixtures_by_ids(list(ids))} if ids else {}
    except FootballApiError as e:
        logger.warning("Settlement: fixtures request failed: %s", e)
        return {"ok": False, "error": "fixtures request failed", "settled": 0}

    stats_cache: dict = {}

    def stats_loader(fx):
        fid = fx["fixture"]["id"]
        if fid not in stats_cache:
            try:
                teams = fx.get("teams") or {}
                stats_cache[fid] = _stat_totals(
                    fixture_statistics(fid), (teams.get("home") or {}).get("id"), (teams.get("away") or {}).get("id")
                )
            except FootballApiError:
                stats_cache[fid] = None
        return stats_cache[fid]

    settled = 0
    for r in records:
        legs = []
        for i, leg in enumerate(r.selections_json or []):
            fid = leg_ids.get((r.pk, i))
            result = evaluate_leg(leg, fixtures.get(fid), stats_loader) if fid else PENDING
            legs.append({
                "fixture": leg.get("fixture"), "market": leg.get("market"),
                "selection": leg.get("selection"), "odd": leg.get("odd"), "result": result,
            })
        status = combine([leg["result"] for leg in legs])
        r.legs_result = legs
        fields = ["legs_result"]
        if status != PENDING:
            r.status = status
            r.settled_at = timezone.now()
            fields += ["status", "settled_at"]
            settled += 1
        r.save(update_fields=fields)
    logger.info("Settlement: %s records checked, %s settled", len(records), settled)
    return {"ok": True, "checked": len(records), "settled": settled}
