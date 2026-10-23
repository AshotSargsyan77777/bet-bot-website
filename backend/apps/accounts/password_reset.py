"""Password reset: a one-time link sent to the user's linked Telegram and/or email.

The token is Django's default_token_generator (valid PASSWORD_RESET_TIMEOUT seconds, single use:
it stops working as soon as the password changes).
"""

import logging

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.db.models import Q
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.accounts.telegram import is_configured as telegram_configured
from apps.accounts.telegram import send_message, site_url
from config.i18n import current_lang

logger = logging.getLogger(__name__)
User = get_user_model()

TEXTS = {
    "hy": (
        "Goalking — գաղտնաբառի վերականգնում",
        "🔑 Goalking — գաղտնաբառի վերականգնում\n\nՕգտանուն՝ {username}\nՆոր գաղտնաբառ սահմանելու համար բացեք հղումը (վավեր է {minutes} րոպե)՝\n{link}\n\nԵթե դուք չեք խնդրել, պարզապես անտեսեք այս հաղորդագրությունը։",
    ),
    "en": (
        "Goalking — password reset",
        "🔑 Goalking — password reset\n\nUsername: {username}\nOpen the link to set a new password (valid for {minutes} minutes):\n{link}\n\nIf you didn't ask for this, just ignore this message.",
    ),
    "ru": (
        "Goalking — восстановление пароля",
        "🔑 Goalking — восстановление пароля\n\nИмя пользователя: {username}\nОткройте ссылку, чтобы задать новый пароль (действует {minutes} минут):\n{link}\n\nЕсли вы этого не запрашивали, просто проигнорируйте сообщение.",
    ),
}


def email_configured() -> bool:
    return bool(settings.BREVO_API_KEY and settings.EMAIL_FROM)


def send_email(to: str, subject: str, text: str) -> bool:
    return deliver_email(to, subject, text) is None


def email_config_problem() -> str | None:
    missing = [name for name in ("BREVO_API_KEY", "EMAIL_FROM") if not getattr(settings, name)]
    return f"Railway Variables: missing {', '.join(missing)}" if missing else None


def deliver_email(to: str, subject: str, text: str) -> str | None:
    """Sends through Brevo's HTTP API (Railway blocks plain SMTP on lower plans).
    Returns None on success, otherwise a short reason (Brevo's own message when it gives one)."""
    problem = email_config_problem()
    if problem or not to:
        return problem or "no recipient"
    try:
        r = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
            json={
                "sender": {"email": settings.EMAIL_FROM, "name": settings.EMAIL_FROM_NAME},
                "to": [{"email": to}],
                "subject": subject,
                "textContent": text,
            },
            timeout=10,
        )
        if r.status_code >= 300:
            logger.warning("Brevo email failed: HTTP %s %s", r.status_code, r.text[:200])
            try:
                reason = r.json().get("message") or r.text[:200]
            except ValueError:
                reason = r.text[:200]
            return f"Brevo HTTP {r.status_code}: {reason}"
        return None
    except requests.RequestException as e:
        logger.warning("Brevo email failed: %s", e)
        return f"Brevo unreachable: {e.__class__.__name__}"


def find_user(login: str):
    login = (login or "").strip()
    if not login:
        return None
    return (
        User.objects.filter(is_active=True)
        .filter(Q(username__iexact=login) | Q(email__iexact=login))
        .select_related("telegram")
        .first()
    )


def reset_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return site_url(f"/reset-password?uid={uid}&token={token}")


def send_reset(user) -> list[str]:
    """Sends the link to every channel the user has; returns the channels used (for logs/tests only)."""
    link = reset_link(user)
    if not link:
        logger.error("Password reset impossible: SITE_URL is not configured")
        return []
    subject, body = TEXTS[current_lang()]
    text = body.format(username=user.username, link=link, minutes=settings.PASSWORD_RESET_TIMEOUT // 60)
    used = []
    account = getattr(user, "telegram", None) if hasattr(user, "telegram") else None
    if account and telegram_configured() and send_message(account.telegram_id, text):
        used.append("telegram")
    if user.email and send_email(user.email, subject, text):
        used.append("email")
    return used


def user_from_uid(uid: str):
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        return User.objects.get(pk=pk, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
