import re
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import TelegramAccount

User = get_user_model()


@override_settings(
    SITE_URL="https://goalking.example", TELEGRAM_BOT_TOKEN="123:abc", BREVO_API_KEY="brevo", EMAIL_FROM="noreply@example.com"
)
class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters
        self.user = User.objects.create_user("Ashot", "ashot@example.com", "Old!Passw0rd")
        TelegramAccount.objects.create(user=self.user, telegram_id=777, notifications=False)

    def tearDown(self):
        cache.clear()

    def request_reset(self, login, lang="hy"):
        with mock.patch("apps.accounts.password_reset.send_message", return_value=True) as tg, \
                mock.patch("apps.accounts.password_reset.requests.post") as post:
            post.return_value.status_code = 201
            r = self.client.post("/api/auth/password-reset/", {"login": login}, format="json", HTTP_ACCEPT_LANGUAGE=lang)
        return r, tg, post

    def test_link_goes_to_telegram_and_email_even_with_notifications_off(self):
        r, tg, post = self.request_reset("ashot")  # case-insensitive username
        self.assertEqual(r.json(), {"ok": True})
        self.assertEqual(tg.call_args.args[0], 777)
        self.assertIn("https://goalking.example/reset-password?uid=", tg.call_args.args[1])
        self.assertEqual(post.call_args.kwargs["json"]["to"], [{"email": "ashot@example.com"}])
        r, tg, _ = self.request_reset("ASHOT@example.com", lang="ru")  # by email, Russian text
        self.assertIn("восстановление пароля", tg.call_args.args[1])

    def test_unknown_account_gets_the_same_answer(self):
        r, tg, post = self.request_reset("nobody")
        self.assertEqual((r.status_code, r.json()), (200, {"ok": True}))
        tg.assert_not_called()
        post.assert_not_called()

    def test_confirm_sets_password_once_and_logs_out(self):
        refresh = self.client.post("/api/auth/token/", {"username": "Ashot", "password": "Old!Passw0rd"}, format="json").data["refresh"]
        _, tg, _ = self.request_reset("Ashot")
        uid, token = re.search(r"uid=([^&]+)&token=(\S+)", tg.call_args.args[1]).groups()
        url = "/api/auth/password-reset/confirm/"
        weak = self.client.post(url, {"uid": uid, "token": token, "new_password": "12345678"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertIn("new_password", weak.json()["fields"])
        ok = self.client.post(url, {"uid": uid, "token": token, "new_password": "N3w!Passw0rd"}, format="json")
        self.assertEqual(ok.json(), {"ok": True, "username": "Ashot"})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("N3w!Passw0rd"))
        # the link works only once, and the old session is logged out
        again = self.client.post(url, {"uid": uid, "token": token, "new_password": "An0ther!Pass"}, format="json", HTTP_ACCEPT_LANGUAGE="en")
        self.assertEqual(again.status_code, 400)
        self.assertIn("invalid or expired", again.json()["error"])
        self.assertEqual(self.client.post("/api/auth/token/refresh/", {"refresh": refresh}, format="json").status_code, 401)
        self.assertEqual(self.client.post(url, {"uid": "xx", "token": "yy", "new_password": "N3w!Passw0rd"}, format="json").status_code, 400)

    def test_throttled(self):
        codes = [self.request_reset("nobody")[0].status_code for _ in range(6)]
        self.assertEqual(codes[-1], 429)


class AdminTestEmailTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "boss@example.com", "x", is_staff=True)
        self.client.force_authenticate(self.admin)

    @override_settings(BREVO_API_KEY="", EMAIL_FROM="")
    def test_reports_missing_settings(self):
        r = self.client.post("/api/admin/test-email/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("BREVO_API_KEY, EMAIL_FROM", r.json()["error"])

    @override_settings(BREVO_API_KEY="bad", EMAIL_FROM="noreply@example.com")
    def test_shows_brevo_error_and_success(self):
        with mock.patch("apps.accounts.password_reset.requests.post") as post:
            post.return_value.status_code = 401
            post.return_value.json.return_value = {"code": "unauthorized", "message": "Key not found"}
            r = self.client.post("/api/admin/test-email/", {"to": "me@example.com"}, format="json")
            self.assertEqual(r.json()["error"], "Brevo HTTP 401: Key not found")
            post.return_value.status_code = 201
            r = self.client.post("/api/admin/test-email/", {}, format="json")
        self.assertEqual(r.json(), {"ok": True, "to": "boss@example.com"})

    def test_admin_only(self):
        self.client.force_authenticate(User.objects.create_user("u", "u@example.com", "x"))
        self.assertEqual(self.client.post("/api/admin/test-email/", {}, format="json").status_code, 403)
