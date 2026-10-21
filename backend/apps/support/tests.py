from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class SupportTests(APITestCase):
    def test_ticket_reply_flow(self):
        user = User.objects.create_user("u", "u@example.com", "x")
        other = User.objects.create_user("o", "o@example.com", "x")
        admin = User.objects.create_user("a", "a@example.com", "x", is_staff=True)

        self.client.force_authenticate(user)
        self.assertEqual(self.client.post("/api/support/", {"message": "   "}, format="json").status_code, 400)
        r = self.client.post("/api/support/", {"message": "Where is my check?"}, format="json")
        self.assertEqual(r.status_code, 201)
        tid = r.data["id"]

        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/support/").data["count"], 0)
        self.assertEqual(self.client.patch(f"/api/admin/support/{tid}/", {"reply": "x"}, format="json").status_code, 403)

        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get("/api/admin/support/?state=unanswered").data["count"], 1)
        r = self.client.patch(f"/api/admin/support/{tid}/", {"reply": "It is ready now"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["is_read"])
        self.assertEqual(r.data["replied_by"], "a")

        self.client.force_authenticate(user)
        ticket = self.client.get("/api/support/").data["results"][0]
        self.assertEqual(ticket["reply"], "It is ready now")
