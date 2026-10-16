from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.notifications.categories import classify_notification
from apps.notifications.emails import EmailNotificationService
from apps.notifications.models import (
    Notification,
    NotificationCategoryPolicy,
    NotificationDelivery,
    NotificationPreference,
)
from apps.notifications.services import NotificationService
from apps.notifications.tasks import dispatch_notification
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class NotificationCategoryTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Categorias", slug="notification-categories")
        self.user = User.objects.create_user(email="categories@example.com", password="password123", full_name="Categorias", organization=self.org, role="admin", phone_is_whatsapp=True)
        self.pref = NotificationPreference.objects.create(user=self.user, whatsapp_reproductive_alerts=True)

    def test_cycle_and_overdue_events_are_classified_without_guessing_titles(self):
        for event in ("livestock.next_mating:1", "livestock.reproductive_vaccine.birth:1"):
            notification = NotificationService.create(self.user, "Mesmo título", "Aviso", notif_type="animal", event_key=event)
            self.assertEqual(notification.category, "animal_cycle")
        notification = NotificationService.create(self.user, "Mesmo título", "Aviso", notif_type="finance", event_key="finance.transaction.overdue:1")
        self.assertEqual(notification.category, "overdue_payment")
        self.assertEqual(classify_notification("animal", "livestock.batch.created:1"), "animal")
        self.assertEqual(classify_notification("finance"), "finance")
        with self.assertRaises(ValueError):
            classify_notification("system", category="marketing")

    def test_history_migration_classifies_events_and_preserves_state_and_policies(self):
        from importlib import import_module
        from types import SimpleNamespace

        from django.apps import apps
        from django.db import connection

        rows = [
            Notification.objects.create(user=self.user, type="animal", title="Ciclo", message="Aviso", event_key="livestock.next_mating:old", is_read=True, is_archived=True),
            Notification.objects.create(user=self.user, type="finance", title="Atraso", message="Aviso", event_key="finance.transaction.overdue:old"),
            Notification.objects.create(user=self.user, type="finance", title="Pagamento atrasado", message="Sem identificação do evento"),
        ]
        NotificationCategoryPolicy.objects.filter(category="system").update(enabled=False)
        migration = import_module("apps.notifications.migrations.0004_notificationcategorypolicy_notification_category_and_more")
        migration.classify_history(apps, SimpleNamespace(connection=connection))
        for row in rows:
            row.refresh_from_db()
        self.assertEqual([row.category for row in rows], ["animal_cycle", "overdue_payment", "finance"])
        self.assertTrue(rows[0].is_read)
        self.assertTrue(rows[0].is_archived)
        self.assertFalse(NotificationCategoryPolicy.objects.get(category="system").enabled)

    def test_disabled_category_blocks_creation_and_bulk_while_other_types_continue(self):
        NotificationCategoryPolicy.objects.filter(category="animal_cycle").update(enabled=False)
        self.assertIsNone(NotificationService.create(self.user, "Vacina", "Hoje", notif_type="animal", event_key="livestock.next_mating:1"))
        self.assertEqual(NotificationService.create_bulk([self.user], "Ciclo", "Hoje", notif_type="animal", category="animal_cycle"), [])
        self.assertIsNotNone(NotificationService.create(self.user, "Sistema", "Aviso"))

    def test_channel_limits_do_not_override_user_preferences(self):
        NotificationCategoryPolicy.objects.filter(category="animal_cycle").update(email_enabled=False, push_enabled=False, whatsapp_enabled=True)
        notification = NotificationService.create(self.user, "Vacina", "Hoje", notif_type="animal", event_key="livestock.next_mating:1")
        self.assertEqual(list(notification.deliveries.values_list("channel", flat=True)), ["whatsapp_web"])
        self.user.receive_system_alerts = False
        self.assertIsNone(NotificationService.create(self.user, "Sistema", "Aviso"))

    def test_external_only_category_stays_in_platform_history_without_unread_badge(self):
        NotificationCategoryPolicy.objects.filter(category="system").update(in_app_enabled=False)
        notification = NotificationService.create(self.user, "Sistema", "E-mail")
        self.assertFalse(notification.show_in_app)
        self.assertTrue(notification.deliveries.filter(channel="email").exists())
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(reverse("notifications-list")).data["count"], 0)
        self.assertEqual(self.client.get(reverse("unread-count")).data["unread_count"], 0)

    @patch("apps.notifications.emails.send_mail")
    @patch("apps.notifications.tasks.wpp_request")
    def test_category_disabled_after_queueing_skips_pending_deliveries(self, transport, send_mail):
        notification = NotificationService.create(self.user, "Atraso", "Hoje", notif_type="finance", event_key="finance.transaction.overdue:1")
        NotificationCategoryPolicy.objects.filter(category="overdue_payment").update(enabled=False)
        dispatch_notification.run(str(notification.pk))
        self.assertFalse(notification.deliveries.exclude(status="skipped").exists())
        send_mail.assert_not_called()
        transport.assert_not_called()
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())

    def test_marketing_requires_platform_enablement_and_user_opt_in(self):
        self.assertIsNone(NotificationService.create(self.user, "Promoção", "Oferta", notif_type="marketing"))
        NotificationCategoryPolicy.objects.filter(category="marketing").update(enabled=True)
        self.assertIsNone(NotificationService.create(self.user, "Promoção", "Oferta", notif_type="marketing"))
        self.pref.marketing_alerts = True
        self.pref.save()
        notification = NotificationService.create(self.user, "Promoção", "Oferta", notif_type="marketing")
        self.assertEqual(notification.category, "marketing")
        self.assertFalse(notification.deliveries.filter(channel="whatsapp_web").exists())

    @patch("apps.notifications.emails.send_mail")
    def test_digest_excludes_disabled_categories_and_unconsented_marketing(self, send_mail):
        self.pref.frequency = "daily"
        self.pref.save()
        Notification.objects.create(user=self.user, title="Sistema", message="Permitido")
        Notification.objects.create(user=self.user, title="Ciclo", message="Bloqueado", type="animal", category="animal_cycle")
        Notification.objects.create(user=self.user, title="Propaganda", message="Bloqueado", type="marketing", category="marketing")
        NotificationCategoryPolicy.objects.filter(category="animal_cycle").update(email_enabled=False)
        NotificationCategoryPolicy.objects.filter(category="marketing").update(enabled=True)
        EmailNotificationService.send_daily_digest(self.user)
        self.assertEqual(send_mail.call_count, 1)
        self.assertIn("1 notificações", send_mail.call_args.kwargs["message"])
        self.assertNotIn("Ciclo", send_mail.call_args.kwargs["html_message"])
        self.assertNotIn("Propaganda", send_mail.call_args.kwargs["html_message"])

    def test_operational_alerts_respect_master_and_platform_cycle_rules(self):
        self.client.force_authenticate(self.user)
        self.user.receive_system_alerts = False
        self.user.save()
        response = self.client.get("/api/v1/livestock/dashboard/reproduction/", {"species": "suinos"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["notifications_enabled"])
        self.user.receive_system_alerts = True
        self.user.save()
        NotificationCategoryPolicy.objects.filter(category="animal_cycle").update(enabled=False)
        response = self.client.get("/api/v1/livestock/dashboard/reproduction/", {"species": "suinos"})
        self.assertFalse(response.data["notifications_enabled"])



class PlatformNotificationControlTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="platform-notifications@example.com", password="password123", full_name="Admin")
        PlatformStaffProfile.objects.create(user=self.admin, role="platform_admin")
        self.client.force_authenticate(self.admin)
        self.org = Organization.objects.create(name="Histórico", slug="notification-history")
        self.member = User.objects.create_user(email="history@example.com", password="password123", full_name="Membro", organization=self.org, role="admin")

    def test_admin_lists_categories_and_saves_audited_policy(self):
        response = self.client.get(reverse("platform-notification-categories"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 8)
        response = self.client.patch(reverse("platform-notification-category-detail", args=["overdue_payment"]), {"enabled": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])
        self.assertTrue(PlatformAuditLog.objects.filter(action="notifications.category.updated", actor=self.admin).exists())

    def test_unknown_categories_and_unsupported_whatsapp_are_rejected(self):
        self.assertEqual(self.client.patch(reverse("platform-notification-category-detail", args=["unknown"]), {"enabled": False}, format="json").status_code, 404)
        response = self.client.patch(reverse("platform-notification-category-detail", args=["finance"]), {"whatsapp_enabled": True}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_paginated_history_filters_categories_and_organizations(self):
        for index in range(22):
            notification = Notification.objects.create(user=self.member, title=f"Ciclo {index}", message="Aviso", type="animal", category="animal_cycle")
            NotificationDelivery.objects.create(notification=notification, channel="email", status="sent")
        Notification.objects.create(user=self.admin, title="Sistema", message="Aviso")
        response = self.client.get(reverse("platform-notification-history"), {"category": "animal_cycle", "organization": self.org.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 22)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])
        self.assertEqual(response.data["results"][0]["deliveries"][0]["status"], "sent")
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as small_page:
            self.client.get(reverse("platform-notification-history"), {"page_size": 1})
        with CaptureQueriesContext(connection) as large_page:
            self.client.get(reverse("platform-notification-history"), {"page_size": 20})
        self.assertLessEqual(len(large_page), len(small_page) + 1)
        self.assertEqual(self.client.get(reverse("platform-notification-history"), {"category": "unknown"}).status_code, 400)

    def test_tenant_admin_cannot_read_or_update_platform_rules(self):
        self.client.force_authenticate(self.member)
        for route in ("platform-notification-categories", "platform-notification-history"):
            self.assertEqual(self.client.get(reverse(route)).status_code, 403)
        self.assertEqual(self.client.patch(reverse("platform-notification-category-detail", args=["system"]), {"enabled": False}, format="json").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("platform-notification-history")).status_code, 401)

    def test_client_sees_classification_and_cannot_change_it(self):
        self.client.force_authenticate(self.member)
        notification = Notification.objects.create(user=self.member, title="Ciclo", message="Aviso", type="animal", category="animal_cycle")
        response = self.client.get(reverse("notifications-list"), {"category": "animal_cycle"})
        self.assertEqual(response.data["results"][0]["category_display"], "Ciclos dos animais")
        self.client.patch(reverse("notifications-detail", args=[notification.pk]), {"category": "marketing", "type": "marketing"}, format="json")
        notification.refresh_from_db()
        self.assertEqual(notification.category, "animal_cycle")
        self.assertEqual(notification.type, "animal")
