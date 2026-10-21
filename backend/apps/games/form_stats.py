from apps.games.football_api import team_last_fixtures


def aggregate_form(team_id: int, team_name: str, last_n: int = 5, venue_filter: str = "all") -> dict:
    venue = venue_filter if venue_filter in ("home", "away") else None
    matches = team_last_fixtures(team_id, last=last_n, venue=venue)
    wins = draws = losses = 0
    gf = ga = 0
    btts = clean = 0
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
        gf += my_g
        ga += opp_g
        if my_g > opp_g:
            wins += 1
        elif my_g < opp_g:
            losses += 1
        else:
            draws += 1
        if gh > 0 and ga_m > 0:
            btts += 1
        if opp_g == 0:
            clean += 1
        simplified.append(
            {
                "date": (m.get("fixture") or {}).get("date"),
                "home": home.get("name"),
                "away": away.get("name"),
                "score": f"{gh}-{ga_m}",
                "venue": "home" if is_home else "away",
            }
        )

    played = wins + draws + losses
    win_pct = (wins / played * 100) if played else 0
    avg_gf = gf / played if played else 0
    avg_ga = ga / played if played else 0
    btts_rate = (btts / played * 100) if played else 0
    cs_rate = (clean / played * 100) if played else 0

    return {
        "team_id": team_id,
        "team_name": team_name,
        "last_n": last_n,
        "venue_filter": venue_filter,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "goals_for": gf,
        "goals_against": ga,
        "win_pct": round(win_pct, 1),
        "avg_goals_for": round(avg_gf, 2),
        "avg_goals_against": round(avg_ga, 2),
        "btts_rate": round(btts_rate, 1),
        "clean_sheet_rate": round(cs_rate, 1),
        "matches": simplified,
    }
