from django.db import IntegrityError, transaction

from apps.analysis.models import MatchAnalysis

MAX_ANALYSES = 120
MAX_REPORT_CHARS = 20000


def store_match_analyses(items: list, today: str) -> int:
    """Saves n8n's match analyses for today. The first analysis of a match is kept for the whole day
    (like checks, what a user bought must not change)."""
    saved = 0
    existing = set(MatchAnalysis.objects.filter(date=today).values_list("fixture_id", flat=True))
    for raw in items[:MAX_ANALYSES]:
        if not isinstance(raw, dict) or not isinstance(raw.get("report"), dict):
            continue
        try:
            fixture_id = int(raw.get("fixture_id"))
        except (TypeError, ValueError):
            continue
        home, away = str(raw.get("home") or "")[:120], str(raw.get("away") or "")[:120]
        if fixture_id in existing or not home or not away or len(str(raw["report"])) > MAX_REPORT_CHARS:
            continue
        picks = [p for p in raw.get("picks") or [] if isinstance(p, dict)][:10]
        try:
            league_id = int(raw["league_id"]) if raw.get("league_id") is not None else None
        except (TypeError, ValueError):
            league_id = None
        try:
            with transaction.atomic():
                MatchAnalysis.objects.create(
                    date=today, fixture_id=fixture_id, league_id=league_id, home=home, away=away,
                    report=raw["report"], picks=picks,
                )
        except IntegrityError:  # a concurrent post stored it first
            continue
        existing.add(fixture_id)
        saved += 1
    return saved
