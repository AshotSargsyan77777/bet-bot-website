"""Telegram integration: Login Widget verification and notifications through the Goalking bot."""

import hashlib
import hmac
import logging
import threading
import time

import requests
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)

LOGIN_MAX_AGE = 24 * 3600
MESSAGE_LIMIT = 4000


class TelegramAuthError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def verify_login(data: dict) -> dict:
    """Checks the Telegram Login Widget signature (https://core.telegram.org/widgets/login#checking-authorization)."""
    if not is_configured():
        raise TelegramAuthError("Telegram մուտքը կարգավորված չէ")
    fields = {k: str(v) for k, v in (data or {}).items() if v is not None and k != "hash"}
    received = str((data or {}).get("hash") or "")
    if not received or "id" not in fields or "auth_date" not in fields:
        raise TelegramAuthError("Telegram-ի տվյալները թերի են")
    check_string = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise TelegramAuthError("Telegram-ի ստորագրությունը սխալ է")
    try:
        age = time.time() - int(fields["auth_date"])
        telegram_id = int(fields["id"])
    except ValueError:
        raise TelegramAuthError("Telegram-ի տվյալները սխալ են")
    if age > LOGIN_MAX_AGE:
        raise TelegramAuthError("Telegram մուտքի ժամկետը անցել է, փորձեք նորից")
    return {
        "telegram_id": telegram_id,
        "username": fields.get("username", "")[:64],
        "first_name": fields.get("first_name", "")[:128],
        "photo_url": fields.get("photo_url", "")[:500],
    }


def send_message(chat_id: int, text: str) -> bool:
    if not is_configured():
        return False
    if len(text) > MESSAGE_LIMIT:
        text = text[: MESSAGE_LIMIT - 1] + "…"
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
            timeout=10,
        )
        if r.status_code != 200:
            logger.warning("Telegram sendMessage to %s failed: HTTP %s", chat_id, r.status_code)
            return False
        return True
    except requests.RequestException as e:
        logger.warning("Telegram sendMessage to %s failed: %s", chat_id, e)
        return False


def _dispatch(fn):
    """Runs after the DB transaction commits; in a background thread so requests never wait on Telegram."""
    if settings.TELEGRAM_ASYNC:
        transaction.on_commit(lambda: threading.Thread(target=fn, daemon=True).start())
    else:
        transaction.on_commit(fn)


def _chat_id_for(user):
    account = getattr(user, "telegram", None) if user else None
    if account is None or not account.notifications:
        return None
    return account.telegram_id


def notify_user(user, text: str) -> None:
    from apps.accounts.models import TelegramAccount

    if not is_configured() or not user:
        return
    try:
        chat_id = _chat_id_for(user)
    except TelegramAccount.DoesNotExist:
        return
    if chat_id:
        _dispatch(lambda: send_message(chat_id, text))


def broadcast(text: str) -> int:
    """Sends a message to every user who linked Telegram and kept notifications on."""
    from apps.accounts.models import TelegramAccount

    if not is_configured():
        return 0
    chat_ids = list(TelegramAccount.objects.filter(notifications=True).values_list("telegram_id", flat=True))

    def run():
        for chat_id in chat_ids:
            send_message(chat_id, text)
            time.sleep(0.05)  # stay well below Telegram's 30 messages/second limit

    if chat_ids:
        _dispatch(run)
    return len(chat_ids)


def site_url(path: str = "") -> str:
    base = settings.SITE_URL.rstrip("/")
    return f"{base}{path}" if base else ""
