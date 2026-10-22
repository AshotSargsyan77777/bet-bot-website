import hashlib
import hmac
import time
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import TelegramAccount
from apps.checks.models import AppSettings, DailyCheck
from apps.checks.services.time import yerevan_today
from apps.commerce.models import Payment

User = get_user_model()
TOKEN = "123:TEST"


def signed(**fields):
    data = {"id": 555, "first_name": "Ashot", "username": "ashot", "auth_date": int(time.time()), **fields}
    check = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    secret = hashlib.sha256(TOKEN.encode()).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return data


@override_settings(TELEGRAM_BOT_TOKEN=TOKEN, TELEGRAM_BOT_USERNAME="goalking_bot", TELEGRAM_ASYNC=False, SITE_URL="https://site.test")
class TelegramAuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # auth throttle counters are shared between tests

    def test_config(self):
        self.assertEqual(self.client.get("/api/config/").data["telegram_bot_username"], "goalking_bot")

    def test_login_creates_then_reuses_user(self):
        r = self.client.post("/api/auth/telegram/", signed(), format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["created"])
        user = User.objects.get(telegram__telegram_id=555)
        self.assertEqual(user.username, "ashot")
        self.assertFalse(user.has_usable_password())
        r = self.client.post("/api/auth/telegram/", signed(username="ashot_new"), format="json")
        self.assertFalse(r.data["created"])
        self.assertEqual(TelegramAccount.objects.get().username, "ashot_new")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        me = self.client.get("/api/me/").data
        self.assertEqual(me["telegram"]["username"], "ashot_new")
        self.assertFalse(me["has_password"])
        # Telegram users can set a password without a current one
        r = self.client.post("/api/auth/password/", {"new_password": "N3w-strong-pass"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)

    def test_rejects_bad_or_old_signature(self):
        bad = signed()
        bad["first_name"] = "Hacker"
        self.assertEqual(self.client.post("/api/auth/telegram/", bad, format="json").status_code, 400)
        old = signed(auth_date=int(time.time()) - 3 * 86400)
        self.assertEqual(self.client.post("/api/auth/telegram/", old, format="json").status_code, 400)
        with self.settings(TELEGRAM_BOT_TOKEN=""):
            self.assertEqual(self.client.post("/api/auth/telegram/", signed(), format="json").status_code, 400)

    def test_username_clash_uses_tg_id(self):
        User.objects.create_user("ashot", "x@example.com", "x")
        self.client.post("/api/auth/telegram/", signed(), format="json")
        self.assertTrue(User.objects.filter(username="tg555").exists())

    def test_link_settings_unlink(self):
        user = User.objects.create_user("u", "u@example.com", "Pass-12345x")
        other = User.objects.create_user("o", "o@example.com", "x")
        TelegramAccount.objects.create(user=other, telegram_id=999)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.post("/api/me/telegram/", signed(id=999), format="json").status_code, 409)
        r = self.client.post("/api/me/telegram/", signed(), format="json")
        self.assertEqual(r.data["telegram"]["username"], "ashot")
        r = self.client.patch("/api/me/telegram/", {"notifications": False}, format="json")
        self.assertFalse(r.data["telegram"]["notifications"])
        self.assertEqual(self.client.delete("/api/me/telegram/").status_code, 204)
        self.assertFalse(TelegramAccount.objects.filter(user=user).exists())


@override_settings(TELEGRAM_BOT_TOKEN=TOKEN, TELEGRAM_ASYNC=False, SITE_URL="https://site.test", N8N_INTERNAL_KEY="k", PROMOS_PER_UPDATE=0)
class NotificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("buyer", "b@example.com", "x")
        TelegramAccount.objects.create(user=self.user, telegram_id=777)
        self.admin = User.objects.create_user("boss", "boss@example.com", "x", is_staff=True)
        p = mock.patch("apps.accounts.telegram.requests.post")
        self.post = p.start()
        self.post.return_value.status_code = 200
        self.addCleanup(p.stop)

    def sent(self):
        return [(c.kwargs["json"]["chat_id"], c.kwargs["json"]["text"]) for c in self.post.call_args_list]

    def test_payment_and_support_notifications(self):
        DailyCheck.objects.filter(package_key="standard_3x").update(body_text="REAL CHECK", is_available=True)
        app = AppSettings.get()
        app.checks_date = yerevan_today()
        app.save()
        pay = Payment.objects.create(user=self.user, package_key="standard_3x", receipt="r.png", amount=2000)
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/admin/payments/", {"payment_id": pay.id, "action": "approve"}, format="json")
        chat, text = self.sent()[-1]
        self.assertEqual(chat, 777)
        self.assertIn("REAL CHECK", text)

        pay2 = Payment.objects.create(user=self.user, package_key="pkg_vip", receipt="r.png", amount=5000)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/admin/payments/", {"payment_id": pay2.id, "action": "reject"}, format="json")
        self.assertIn("մերժվեց", self.sent()[-1][1])

        from apps.support.models import SupportTicket

        t = SupportTicket.objects.create(user=self.user, message="?")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/admin/support/{t.id}/", {"reply": "Answer!"}, format="json")
        self.assertIn("Answer!", self.sent()[-1][1])

        # notifications off → nothing sent
        TelegramAccount.objects.update(notifications=False)
        before = len(self.sent())
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(f"/api/admin/support/{t.id}/", {"reply": "Again"}, format="json")
        self.assertEqual(len(self.sent()), before)

    def test_daily_ready_broadcast_once(self):
        pkg = {"tier": "standard", "package": "5x", "available": True, "combined_odds": 5.1,
               "selections": [{"fixture": "A - B", "market": "OU", "selection": "Over 1.5", "odd": 1.3}]}
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                self.client.post("/api/internal/packages/", {"packages": [pkg]}, format="json", HTTP_X_INTERNAL_KEY="k")
        texts = [t for _, t in self.sent()]
        self.assertEqual(len(texts), 1)
        self.assertIn("պատրաստ են", texts[0])
        self.assertIn("https://site.test/checks", texts[0])
