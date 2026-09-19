from django.contrib.auth import get_user_model
from django.urls import resolve, reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification, NotificationPreference, NotificationType
from apps.notifications.services import NotificationService
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

    def test_specific_routes_are_not_captured_as_notification_ids(self):
        preferences = resolve("/api/v1/notifications/preferences/")
        templates = resolve("/api/v1/notifications/templates/")

        self.assertEqual(preferences.url_name, "notification-preferences-list")
        self.assertEqual(templates.url_name, "notification-templates-list")

    def test_user_can_retrieve_notification_preferences(self):
        self.client.force_authenticate(self.member_a)

        response = self.client.get(reverse("notification-preferences-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email_notifications"], True)

        updated = self.client.patch(
            reverse("notification-preferences-list"),
            {"email_notifications": False, "frequency": "weekly"},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["email_notifications"], False)
        self.assertEqual(updated.data["frequency"], "weekly")

    def test_category_preference_blocks_internal_notification(self):
        NotificationPreference.objects.update_or_create(
            user=self.admin_a,
            defaults={"animal_alerts": False},
        )

        notification = NotificationService.create(
            user=self.admin_a,
            title="Vacinação",
            message="Mensagem que deve ser bloqueada.",
            notif_type=NotificationType.ANIMAL,
        )

        self.assertIsNone(notification)
        self.assertFalse(Notification.objects.filter(user=self.admin_a, title="Vacinação").exists())

    def test_system_notifications_ignore_optional_category_preferences(self):
        NotificationPreference.objects.update_or_create(
            user=self.admin_a,
            defaults={
                "stock_alerts": False,
                "animal_alerts": False,
                "financial_alerts": False,
                "report_alerts": False,
            },
        )

        notification = NotificationService.create(
            user=self.admin_a,
            title="Segurança da conta",
            message="Sua senha foi alterada.",
            notif_type=NotificationType.SYSTEM,
        )

        self.assertIsNotNone(notification)

    def test_regular_user_cannot_create_notification_through_collection(self):
        self.client.force_authenticate(self.member_a)

        response = self.client.post("/api/v1/notifications/", self.payload(self.member_a), format="json")

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_event_key_deduplicates_and_groups_occurrences(self):
        first = NotificationService.create(
            user=self.admin_a, title="Estoque baixo", message="Primeira ocorrência",
            notif_type=NotificationType.STOCK, event_key="inventory.low_stock:item-1",
        )
        second = NotificationService.create(
            user=self.admin_a, title="Estoque baixo", message="Ocorrência atualizada",
            notif_type=NotificationType.STOCK, event_key="inventory.low_stock:item-1",
        )

        self.assertEqual(first.id, second.id)
        self.assertEqual(Notification.objects.filter(user=self.admin_a, event_key="inventory.low_stock:item-1").count(), 1)
        self.assertEqual(second.occurrence_count, 2)
        self.assertEqual(second.message, "Ocorrência atualizada")

    def test_user_can_archive_and_restore_own_notification(self):
        notification = NotificationService.create(user=self.member_a, title="Aviso", message="Mensagem")
        self.client.force_authenticate(self.member_a)

        archived = self.client.post(reverse("notifications-archive", args=[notification.id]))
        self.assertEqual(archived.status_code, status.HTTP_200_OK)
        self.assertTrue(archived.data["is_archived"])

        restored = self.client.post(reverse("notifications-unarchive", args=[notification.id]))
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        self.assertFalse(restored.data["is_archived"])

    def test_notification_list_is_paginated_and_tenant_scoped(self):
        NotificationService.create(user=self.member_a, title="Minha", message="Organização A")
        NotificationService.create(user=self.member_b, title="Outra", message="Organização B")
        self.client.force_authenticate(self.member_a)

        response = self.client.get(reverse("notifications-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Minha")
