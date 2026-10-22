from django.conf import settings
from django.db import transaction

from apps.checks.constants import N8N_KEYS, PACKAGES, UNAVAILABLE_TEXT
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.checks_logic import check_is_ready
from apps.checks.services.formatting import format_package
from apps.checks.services.records import record_published_check
from apps.checks.services.time import yerevan_today
from apps.commerce.promo import generate_promo_codes


@transaction.atomic
def apply_n8n_packages(packages: list) -> dict:
    today = yerevan_today()
    app = AppSettings.get()
    DailyCheck.ensure_defaults()

    # A check already published today stays as is until the day ends (people may have bought it);
    # later n8n runs only fill the packages that were not ready yet.
    locked = set()
    if app.checks_date == today:
        locked = {k for k in N8N_KEYS if check_is_ready(DailyCheck.objects.get(package_key=k), today)}

    for key in N8N_KEYS:
        if key in locked:
            continue
        label = PACKAGES[key]["label"]
        dc = DailyCheck.objects.get(package_key=key)
        dc.body_text = f"{label} չեկը {UNAVAILABLE_TEXT}"
        dc.is_available = False
        dc.selections_json = []
        dc.combined_odds = None
        dc.quality = ""
        dc.current_record = None
        dc.save()

    available = 0
    for pkg in packages:
        pkg_key = f"{pkg.get('tier')}_{pkg.get('package')}"
        if pkg_key not in N8N_KEYS or pkg_key in locked:
            continue
        if not pkg.get("available"):
            continue
        selections = pkg.get("selections") or []
        if not isinstance(selections, list) or not all(isinstance(s, dict) for s in selections):
            continue
        if not selections:
            continue
        dc = DailyCheck.objects.get(package_key=pkg_key)
        dc.body_text = format_package(pkg)
        dc.selections_json = selections
        dc.is_available = True
        try:
            odds = round(float(pkg.get("combined_odds")), 2)
            dc.combined_odds = odds if 1 <= odds < 10**8 else None
        except (TypeError, ValueError):
            dc.combined_odds = None
        dc.quality = str(pkg.get("quality") or "")[:16]
        dc.save()
        record_published_check(dc, today)
        available += 1

    app.checks_date = today
    app.save()

    if settings.PROMO_FROM_3X:
        std3 = DailyCheck.objects.filter(package_key="standard_3x").first()
        pkg5 = DailyCheck.objects.filter(package_key="pkg_5").first()
        if std3 and pkg5 and check_is_ready(std3):
            pkg5.body_text = std3.body_text
            pkg5.selections_json = std3.selections_json
            pkg5.is_available = std3.is_available
            pkg5.combined_odds = std3.combined_odds
            pkg5.save()

    new_codes = []
    if settings.PROMOS_PER_UPDATE > 0:
        new_codes = generate_promo_codes(settings.PROMOS_PER_UPDATE)

    ready_list = [k for k in N8N_KEYS if check_is_ready(DailyCheck.objects.get(package_key=k))]
    _announce_ready(app, today, ready_list)
    return {
        "ok": True,
        "received": len(packages),
        "available": available,
        "locked": sorted(locked),
        "checks_date": today,
        "ready": ready_list,
        "new_promo_codes": new_codes,
    }


def _announce_ready(app: AppSettings, today: str, ready_list: list[str]) -> None:
    """Once a day, tell Telegram-linked users that today's checks are ready."""
    from apps.accounts.telegram import broadcast, site_url

    paid = [k for k in ready_list if PACKAGES[k]["price"] > 0]
    if not paid or app.ready_notified_date == today:
        return
    app.ready_notified_date = today
    app.save(update_fields=["ready_notified_date"])
    lines = "\n".join(f"• {PACKAGES[k]['label']}" for k in paid)
    link = site_url("/checks")
    broadcast(f"📊 Այսօրվա չեկերը պատրաստ են՝\n{lines}" + (f"\n\n👉 {link}" if link else ""))
