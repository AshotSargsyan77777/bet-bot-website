"""Display names of the leagues the site and the bot work with (API-Football ids)."""

from django.conf import settings

LEAGUE_NAMES = {
    39: "Premier League",
    140: "La Liga",
    135: "Serie A",
    78: "Bundesliga",
    61: "Ligue 1",
    2: "Champions League",
    3: "Europa League",
    848: "Conference League",
    1: "World Cup",
    4: "Euro",
    5: "Nations League",
}


def site_leagues(counts: dict[int, int]) -> list[dict]:
    """All configured leagues in their fixed order, each with the number of games on the selected day."""
    return [
        {"id": lid, "name": LEAGUE_NAMES.get(lid, f"League {lid}"), "count": counts.get(lid, 0)}
        for lid in settings.GAMES_LEAGUE_IDS
    ]
