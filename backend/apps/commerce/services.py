from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.telegram import notify_user, site_url
from apps.checks.constants import ANALYSIS_KEY, COMBO_TIERS, PROMO_PACKAGES, product_label
from apps.checks.models import DailyCheck
from apps.checks.services.checks_logic import check_is_ready, get_check_display_text
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment, PromoCode, Subscription, VipMember


class PaymentStateError(Exception):
    pass


def get_active_subscriptions(user) -> list[Subscription]:
    """All checks the user can see now (one per package)."""
    if not user or not user.is_authenticated:
        return []
    today = yerevan_today()
    subs = Subscription.objects.filter(user=user, is_active=True).order_by("-created_at")
    return [sub for sub in subs if sub.package_key == "pkg_5" or sub.valid_date == today]


def get_active_subscription(user) -> Subscription | None:
    subs = get_active_subscriptions(user)
    return subs[0] if subs else None


def _activate_subscription(user, check: DailyCheck, from_promo: bool) -> Subscription:
    Subscription.objects.filter(user=user, package_key=check.package_key, is_active=True).update(is_active=False)
    return Subscription.objects.create(
        user=user,
        package_key=check.package_key,
        valid_date=yerevan_today(),
        snapshot_text=get_check_display_text(check),
        record=check.current_record,
        from_promo=from_promo,
    )


@transaction.atomic
def approve_payment(payment_id: int, reviewer=None) -> Payment:
    payment = Payment.objects.select_for_update().select_related("user").get(pk=payment_id)
    if payment.status != Payment.STATUS_PENDING:
        raise PaymentStateError("Վճարումն արդեն դիտարկված է")

    pkg_key = payment.package_key
    is_combo = pkg_key in COMBO_TIERS
    is_analysis = pkg_key == ANALYSIS_KEY
    if is_combo and not payment.combo_order_id:
        raise PaymentStateError("Կոնստրուկտորի պատվերը չի գտնվել")
    if is_analysis and not payment.analysis_order_id:
        raise PaymentStateError("Վերլուծության պատվերը չի գտնվել")
    if pkg_key != "pkg_vip" and not is_combo and not is_analysis:
        check = DailyCheck.objects.filter(package_key=pkg_key).first()
        if not check or not check_is_ready(check):
            raise PaymentStateError("Այս փաթեթի չեկը այսօր պատրաստ չէ")

    payment.status = Payment.STATUS_APPROVED
    payment.reviewed_at = timezone.now()
    payment.reviewed_by = reviewer
    payment.save(update_fields=["status", "reviewed_at", "reviewed_by"])

    label = product_label(pkg_key)
    if is_combo:
        order = payment.combo_order
        order.status = order.STATUS_PAID
        order.paid_at = timezone.now()
        update = ["status", "paid_at"]
        if not order.legs:
            # tier purchase: opens all variants of the day it is approved on
            order.valid_date = yerevan_today()
            update.append("valid_date")
        order.save(update_fields=update)
        if order.body_text:
            text = f"✅ Վճարումը հաստատվեց՝ {label}\n\n{order.body_text}"
        else:
            link = site_url("/combinator")
            text = f"✅ Վճարումը հաստատվեց՝ {label}\nԱյսօրվա բոլոր տարբերակները բացված են կայքում․ ընտրեք ցանկացածը։" + (
                f"\n👉 {link}" if link else ""
            )
        notify_user(payment.user, text)
    elif is_analysis:
        order = payment.analysis_order
        order.status = order.STATUS_PAID
        order.paid_at = timezone.now()
        order.save(update_fields=["status", "paid_at"])
        link = site_url(f"/games/{order.analysis.fixture_id}")
        notify_user(
            payment.user,
            f"✅ Վճարումը հաստատվեց՝ {label}\n⚽ {order.analysis.home} - {order.analysis.away}"
            + (f"\n👉 {link}" if link else ""),
        )
    elif pkg_key == "pkg_vip":
        VipMember.objects.get_or_create(user=payment.user)
        link = settings.VIP_CHANNEL_LINK
        notify_user(payment.user, f"✅ VIP մուտքը հաստատվեց։" + (f"\n👑 {link}" if link else ""))
    else:
        sub = _activate_subscription(payment.user, check, from_promo=False)
        notify_user(payment.user, f"✅ Վճարումը հաստատվեց՝ {label}\n\n{sub.snapshot_text}")
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
    if payment.combo_order_id:
        type(payment.combo_order).objects.filter(pk=payment.combo_order_id).update(status="rejected")
    if payment.analysis_order_id:
        type(payment.analysis_order).objects.filter(pk=payment.analysis_order_id).update(status="rejected")
    label = product_label(payment.package_key)
    notify_user(payment.user, f"❌ Ձեր վճարումը ({label}) մերժվեց։ Հարցերի դեպքում գրեք support-ին կայքում։")
    return payment


def normalize_promo_code(code: str) -> str:
    return (code or "").strip().upper().replace(" ", "").replace("-", "")


@transaction.atomic
def redeem_promo(user, code: str) -> tuple[bool, str]:
    code = normalize_promo_code(code)
    if any(sub.from_promo for sub in get_active_subscriptions(user)):
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

    _activate_subscription(user, check, from_promo=True)
    return True, check.package_key
