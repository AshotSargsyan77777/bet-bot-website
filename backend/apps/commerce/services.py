from django.db import transaction
from django.utils import timezone

from apps.checks.constants import PROMO_PACKAGES
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready, get_check_display_text
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment, PromoCode, Subscription, VipMember


class PaymentStateError(Exception):
    pass


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


def _activate_subscription(user, package_key: str, text: str, from_promo: bool) -> Subscription:
    Subscription.objects.filter(user=user, is_active=True).update(is_active=False)
    return Subscription.objects.create(
        user=user,
        package_key=package_key,
        valid_date=yerevan_today(),
        snapshot_text=text,
        from_promo=from_promo,
    )


@transaction.atomic
def approve_payment(payment_id: int, reviewer=None) -> Payment:
    payment = Payment.objects.select_for_update().select_related("user").get(pk=payment_id)
    if payment.status != Payment.STATUS_PENDING:
        raise PaymentStateError("Վճարումն արդեն դիտարկված է")

    pkg_key = payment.package_key
    if pkg_key != "pkg_vip":
        check = DailyCheck.objects.filter(package_key=pkg_key).first()
        if not check or not check_is_ready(check):
            raise PaymentStateError("Այս փաթեթի չեկը այսօր պատրաստ չէ")

    payment.status = Payment.STATUS_APPROVED
    payment.reviewed_at = timezone.now()
    payment.reviewed_by = reviewer
    payment.save(update_fields=["status", "reviewed_at", "reviewed_by"])

    if pkg_key == "pkg_vip":
        VipMember.objects.get_or_create(user=payment.user)
    else:
        _activate_subscription(payment.user, pkg_key, get_check_display_text(check), from_promo=False)
    return payment


@transaction.atomic
def reject_payment(payment_id: int, reviewer=None) -> Payment:
    payment = Payment.objects.select_for_update().get(pk=payment_id)
    if payment.status != Payment.STATUS_PENDING:
        raise PaymentStateError("Վճարումն արդեն դիտարկված է")
    payment.status = Payment.STATUS_REJECTED
    payment.reviewed_at = timezone.now()
    payment.reviewed_by = reviewer
    payment.save(update_fields=["status", "reviewed_at", "reviewed_by"])
    return payment


def normalize_promo_code(code: str) -> str:
    return (code or "").strip().upper().replace(" ", "").replace("-", "")


@transaction.atomic
def redeem_promo(user, code: str) -> tuple[bool, str]:
    code = normalize_promo_code(code)
    if get_active_subscription(user):
        return False, "already_subscribed"

    # Row lock: two concurrent redemptions of the same code cannot both succeed.
    entry = PromoCode.objects.select_for_update().filter(code=code).first()
    if not entry:
        return False, "invalid"
    if entry.used_by_id:
        return False, "used"

    check = None
    for k in PROMO_PACKAGES:
        candidate = DailyCheck.objects.filter(package_key=k).first()
        if candidate and check_is_ready(candidate):
            check = candidate
            break
    if not check:
        return False, "not_ready"

    entry.used_by = user
    entry.used_at = timezone.now()
    entry.save(update_fields=["used_by", "used_at"])

    _activate_subscription(user, check.package_key, get_check_display_text(check), from_promo=True)
    return True, check.package_key
