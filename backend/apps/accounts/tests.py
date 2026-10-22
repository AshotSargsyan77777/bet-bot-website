from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

User = get_user_model()

STRONG = "Str0ng-pass-123"


class AuthFlowTests(APITestCase):
    def register(self, username="alice", email="alice@example.com", password=STRONG):
        return self.client.post(
            "/api/auth/register/", {"username": username, "email": email, "password": password}, format="json"
        )

    def test_register_login_me_refresh_logout(self):
        r = self.register()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn("password", r.data)
        self.assertTrue(User.objects.get(username="alice").check_password(STRONG))

        r = self.client.post("/api/auth/token/", {"username": "alice", "password": STRONG}, format="json")
        self.assertEqual(r.status_code, 200)
        access, refresh = r.data["access"], r.data["refresh"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        me = self.client.get("/api/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "alice")
        self.assertFalse(me.data["is_admin"])

        r = self.client.post("/api/auth/token/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(r.status_code, 200)
        new_refresh = r.data["refresh"]
        # rotated refresh tokens are blacklisted
        r = self.client.post("/api/auth/token/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(r.status_code, 401)

        self.assertEqual(self.client.post("/api/auth/logout/", {"refresh": new_refresh}, format="json").status_code, 204)
        r = self.client.post("/api/auth/token/refresh/", {"refresh": new_refresh}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_register_validation(self):
        self.register()
        r = self.register(username="ALICE", email="other@example.com")
        self.assertEqual(r.status_code, 400)
        self.assertIn("username", r.data["fields"])
        r = self.register(username="bob", email="Alice@Example.com")
        self.assertIn("email", r.data["fields"])
        r = self.register(username="carol", email="carol@example.com", password="12345678")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(r.data["error"])
        r = self.register(username="dave", email="not-an-email")
        self.assertEqual(r.status_code, 400)

    def test_wrong_password(self):
        self.register()
        r = self.client.post("/api/auth/token/", {"username": "alice", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 401)
        self.assertIn("error", r.data)

    def test_me_requires_auth(self):
        r = self.client.get("/api/me/")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(set(r.data), {"error", "code"})

    def test_email_does_not_grant_admin(self):
        # Self-registered users must never become admins through their e-mail address.
        self.register(email="admin@example.com")
        user = User.objects.get(username="alice")
        self.client.force_authenticate(user)
        self.assertFalse(self.client.get("/api/me/").data["is_admin"])
        self.assertEqual(self.client.get("/api/admin/stats/").status_code, 403)
        call_command("make_admin", "alice", stdout=StringIO())
        self.client.force_authenticate(User.objects.get(username="alice"))
        self.assertTrue(self.client.get("/api/me/").data["is_admin"])

    def test_change_password(self):
        self.register()
        user = User.objects.get(username="alice")
        self.client.force_authenticate(user)
        r = self.client.post(
            "/api/auth/password/", {"current_password": "bad", "new_password": "An0ther-pass-456"}, format="json"
        )
        self.assertEqual(r.status_code, 400)
        r = self.client.post(
            "/api/auth/password/", {"current_password": STRONG, "new_password": "An0ther-pass-456"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("An0ther-pass-456"))

    def test_update_email(self):
        self.register()
        self.register(username="bob", email="bob@example.com")
        self.client.force_authenticate(User.objects.get(username="alice"))
        self.assertEqual(self.client.patch("/api/me/", {"email": "bob@example.com"}, format="json").status_code, 400)
        r = self.client.patch("/api/me/", {"email": "new@example.com", "username": "hacker"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["email"], "new@example.com")
        self.assertEqual(r.data["username"], "alice")


class ApiLanguageTests(APITestCase):
    """Errors follow the Accept-Language header (hy default, en, ru)."""

    def register(self, lang=None, **data):
        body = {"username": "lang1", "email": "l@example.com", "password": "12345678", **data}
        extra = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
        return self.client.post("/api/auth/register/", body, format="json", **extra).json()  # rendered body

    def test_framework_and_own_messages_are_translated(self):
        self.assertIn("Գաղտնաբառը", self.register()["error"])
        self.assertIn("common", self.register("en")["error"])
        self.assertIn("распространён", self.register("ru")["error"])
        User.objects.create_user("taken", "t@example.com", "x")
        own = {"username": "taken", "password": "Str0ng!Passw0rd"}
        self.assertIn("username-ը արդեն", self.register(**own)["error"])
        self.assertIn("already exists", self.register("en", **own)["error"])
        self.assertIn("уже существует", self.register("ru-RU,ru;q=0.9", **own)["fields"]["username"][0])
