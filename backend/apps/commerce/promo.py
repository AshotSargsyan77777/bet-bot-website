import secrets

from apps.checks.services.time import yerevan_today
from apps.commerce.models import PromoCode

PROMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_promo_codes(n: int) -> list[str]:
    out: list[str] = []
    today = yerevan_today()
    while len(out) < n:
        code = "".join(secrets.choice(PROMO_ALPHABET) for _ in range(5))
        if PromoCode.objects.filter(code=code).exists():
            continue
        PromoCode.objects.create(code=code, created_date=today)
        out.append(code)
    return out


def promo_counts() -> dict:
    all_codes = PromoCode.objects.all()
    used = all_codes.filter(used_by__isnull=False).count()
    return {"free": all_codes.count() - used, "used": used}
