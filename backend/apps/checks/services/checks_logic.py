from django.conf import settings

from apps.checks.constants import DEFAULT_TEXT, PACKAGES, UNAVAILABLE_TEXT
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today


def check_is_ready(check: DailyCheck, checks_date: str | None = None) -> bool:
    """`checks_date` may be passed in to avoid re-reading AppSettings for every check."""
    text = check.body_text or ""
    if DEFAULT_TEXT in text or UNAVAILABLE_TEXT in text:
        return False
    if not check.is_available:
        return False
    if check.package_key == "pkg_5" and not settings.PROMO_FROM_3X:
        return True
    if checks_date is None:
        checks_date = AppSettings.get().checks_date
    return checks_date == yerevan_today()


def ready_package_keys() -> list[str]:
    checks_date = AppSettings.get().checks_date
    return [c.package_key for c in DailyCheck.objects.all() if check_is_ready(c, checks_date)]


def get_check_display_text(check: DailyCheck) -> str:
    if check_is_ready(check):
        return check.body_text
    return f"{PACKAGES[check.package_key]['label']} չեկը {UNAVAILABLE_TEXT}"
