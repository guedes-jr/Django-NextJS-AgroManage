from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.organizations.models import Organization

User = get_user_model()


class NotificationTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Notificações A", slug="notifications-a-isolation")
        self.org_b = Organization.objects.create(name="Notificações B", slug="notifications-b-isolation")
        self.admin_a = User.objects.create_user(
            email="notify-admin-a@example.com", password="Password-8472", full_name="Admin A",
            organization=self.org_a, role=User.Role.ADMIN,
        )
        self.member_a = User.objects.create_user(
            email="notify-member-a@example.com", password="Password-8472", full_name="Membro A", organization=self.org_a
        )
        self.member_b = User.objects.create_user(
            email="notify-member-b@example.com", password="Password-8472", full_name="Membro B", organization=self.org_b
        )
        self.client.force_authenticate(self.admin_a)

    def payload(self, user):
        return {"user_id": user.id, "type": "system", "title": "Aviso", "message": "Mensagem administrativa"}

    def test_admin_can_notify_only_users_from_own_organization(self):
        own = self.client.post(reverse("create-notification"), self.payload(self.member_a), format="json")
        self.assertEqual(own.status_code, status.HTTP_201_CREATED)

        foreign = self.client.post(reverse("create-notification"), self.payload(self.member_b), format="json")
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Notification.objects.filter(user=self.member_b).exists())

    def test_regular_member_cannot_create_manual_notification(self):
        self.client.force_authenticate(self.member_a)
        response = self.client.post(reverse("create-notification"), self.payload(self.member_a), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
