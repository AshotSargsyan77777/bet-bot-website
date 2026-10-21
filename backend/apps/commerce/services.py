from django.utils import timezone

from apps.checks.constants import PACKAGES, PROMO_PACKAGES
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready, get_check_display_text
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment, PromoCode, Subscription, VipMember


def get_active_subscription(user) -> Subscription | None:
    if not user or not user.is_authenticated:
        return None
    today = yerevan_today()
    subs = Subscription.objects.filter(user=user, is_active=True).order_by("-created_at")
    for sub in subs:
        if sub.package_key == "pkg_5":
            return sub
        if sub.valid_date == today:
            return sub
    return None


def approve_payment(payment: Payment) -> None:
    user = payment.user
    pkg_key = payment.package_key
    payment.status = Payment.STATUS_APPROVED
    payment.reviewed_at = timezone.now()
    payment.save()

    if pkg_key == "pkg_vip":
        VipMember.objects.get_or_create(user=user)
        return

    check = DailyCheck.objects.filter(package_key=pkg_key).first()
    text = get_check_display_text(check) if check else ""
    Subscription.objects.filter(user=user, is_active=True).update(is_active=False)
    Subscription.objects.create(
        user=user,
        package_key=pkg_key,
        valid_date=yerevan_today(),
        snapshot_text=text,
        from_promo=False,
    )


def reject_payment(payment: Payment) -> None:
    payment.status = Payment.STATUS_REJECTED
    payment.reviewed_at = timezone.now()
    payment.save()


def redeem_promo(user, code: str) -> tuple[bool, str]:
    code = code.strip().upper().replace(" ", "").replace("-", "")
    if get_active_subscription(user):
        return False, "already_subscribed"

    entry = PromoCode.objects.filter(code=code).first()
    if not entry:
        return False, "invalid"
    if entry.used_by_id:
        return False, "used"

    key = None
    for k in PROMO_PACKAGES:
        check = DailyCheck.objects.filter(package_key=k).first()
        if check and check_is_ready(check):
            key = k
            break
    if not key:
        return False, "not_ready"

    check = DailyCheck.objects.get(package_key=key)
    entry.used_by = user
    entry.used_at = timezone.now()
    entry.save()

    Subscription.objects.filter(user=user, is_active=True).update(is_active=False)
    Subscription.objects.create(
        user=user,
        package_key=key,
        valid_date=yerevan_today(),
        snapshot_text=get_check_display_text(check),
        from_promo=True,
    )
    return True, key
