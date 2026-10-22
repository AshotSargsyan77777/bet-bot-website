from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.combinator.models import CombinatorPool

MAX_STORED = 200
MAX_INCOMING = 300


def _clean(s: dict) -> dict | None:
    try:
        odd = round(float(s.get("odd")), 2)
    except (TypeError, ValueError):
        return None
    fixture = str(s.get("fixture") or s.get("fixture_name") or "")[:200]
    market = str(s.get("market") or "")[:40]
    selection = str(s.get("selection") or "")[:120]
    if not (1 < odd < 1000) or not fixture or not market or not selection:
        return None
    try:
        prob = float(s.get("probability"))
        prob = prob if 0 < prob <= 1 else None
    except (TypeError, ValueError):
        prob = None
    reasons = s.get("reasons") if isinstance(s.get("reasons"), list) else []
    return {
        "fixture": fixture,
        "fixture_id": str(s.get("fixture_id") or "")[:20],
        "market": market,
        "selection": selection,
        "odd": odd,
        "probability": prob,
        "reasons": [str(r)[:200] for r in reasons[:5]],
    }


def _key(s: dict) -> tuple:
    return (s["fixture_id"] or s["fixture"], s["market"], s["selection"])


@transaction.atomic
def store_combinator_selections(selections: list, today: str) -> int:
    """Merges n8n's picks into today's combinator pool.

    Merging (instead of replacing) keeps offers a user already found valid until the day ends;
    odds of a repeated pick are refreshed.
    """
    pool, _ = CombinatorPool.objects.select_for_update().get_or_create(date=today)
    merged = {_key(s): s for s in pool.selections}
    for raw in selections[:MAX_INCOMING]:
        s = _clean(raw) if isinstance(raw, dict) else None
        if s:
            merged[_key(s)] = s
    items = sorted(merged.values(), key=lambda s: -(s["probability"] or 0))[:MAX_STORED]
    pool.selections = items
    pool.save()
    CombinatorPool.objects.exclude(date=today).filter(updated_at__lt=timezone.now() - timedelta(days=7)).delete()
    return len(items)


def todays_selections(today: str) -> list[dict]:
    pool = CombinatorPool.objects.filter(date=today).first()
    return pool.selections if pool else []
