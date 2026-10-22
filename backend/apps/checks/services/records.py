import hashlib
import json

from apps.checks.models import CheckRecord, DailyCheck


def _content_hash(body_text: str, selections: list) -> str:
    if selections:
        key = [(s.get("fixture"), s.get("market"), s.get("selection")) for s in selections]
        raw = json.dumps(key, ensure_ascii=False, sort_keys=True)
    else:
        raw = body_text.strip()
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def record_published_check(check: DailyCheck, date: str) -> CheckRecord:
    """Stores the check version that is being published and makes it the day's current one."""
    content_hash = _content_hash(check.body_text, check.selections_json or [])
    record, created = CheckRecord.objects.get_or_create(
        package_key=check.package_key,
        date=date,
        content_hash=content_hash,
        defaults={
            "body_text": check.body_text,
            "selections_json": check.selections_json or [],
            "combined_odds": check.combined_odds,
            "quality": check.quality or "",
        },
    )
    CheckRecord.objects.filter(package_key=check.package_key, date=date).exclude(pk=record.pk).update(is_final=False)
    if not record.is_final:
        record.is_final = True
        record.save(update_fields=["is_final"])
    check.current_record = record
    check.save(update_fields=["current_record"])
    return record


def visible_history():
    """Past checks shown publicly: the final version of each day plus any version someone bought."""
    from datetime import date as date_cls

    from django.db.models import Q

    from apps.checks.services.time import yerevan_today

    today = date_cls.fromisoformat(yerevan_today()).isoformat()
    return (
        CheckRecord.objects.filter(date__lt=today)
        .filter(Q(is_final=True) | Q(subscriptions__isnull=False))
        .distinct()
    )


def results_stats(days: int = 30) -> dict:
    from datetime import date as date_cls, timedelta

    from apps.checks.constants import PACKAGES
    from apps.checks.services.time import yerevan_today

    since = (date_cls.fromisoformat(yerevan_today()) - timedelta(days=days)).isoformat()
    rows = visible_history().filter(date__gte=since).values_list("package_key", "status")
    total = {"won": 0, "lost": 0, "void": 0, "pending": 0}
    by_package: dict = {}
    for key, status in rows:
        total[status] = total.get(status, 0) + 1
        bp = by_package.setdefault(key, {"key": key, "label": PACKAGES.get(key, {}).get("label", key), "won": 0, "lost": 0})
        if status in ("won", "lost"):
            bp[status] += 1
    settled = total["won"] + total["lost"]
    return {
        "days": days,
        **total,
        "settled": settled,
        "win_rate": round(total["won"] / settled * 100, 1) if settled else None,
        "by_package": sorted(by_package.values(), key=lambda x: x["key"]),
    }
