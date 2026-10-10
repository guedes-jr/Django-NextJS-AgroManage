from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.serializers import UserCreateSerializer
from apps.notifications.emails import EmailNotificationService
from apps.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationPreference,
    NotificationType,
)
from apps.notifications.services import NotificationService
from apps.notifications.tasks import _send_whatsapp_web, dispatch_notification
from apps.organizations.models import Organization

User = get_user_model()


class WhatsAppContactTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Contatos", slug="whatsapp-contacts")
        self.user = User.objects.create_user(email="contact@example.com", password="password123", full_name="Contato", organization=self.org, role="owner", phone="81999990000")
        self.client.force_authenticate(self.user)

    def test_registration_persists_flags_and_hashes_password(self):
        serializer = UserCreateSerializer(data={"email": "new@example.com", "full_name": "Novo", "password": "password123", "password_confirm": "password123", "phone": "81999990000", "phone_is_whatsapp": True, "receive_system_alerts": True})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertTrue(user.check_password("password123"))
        self.assertTrue(user.phone_is_whatsapp)
        self.assertTrue(user.receive_system_alerts)
        self.assertTrue(user.notification_preference.whatsapp_reproductive_alerts)

    def test_registration_without_consent_defaults_to_false(self):
        serializer = UserCreateSerializer(data={"email": "default@example.com", "full_name": "Novo", "password": "password123", "password_confirm": "password123"})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertFalse(user.phone_is_whatsapp)
        self.assertFalse(user.receive_system_alerts)
        self.assertFalse(user.notification_preference.whatsapp_reproductive_alerts)

    def test_profile_round_trip_and_unrelated_edit_preserves_preferences(self):
        response = self.client.patch(reverse("auth_me"), {"phone_is_whatsapp": "true", "receive_system_alerts": "true"}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["phone_is_whatsapp"])
        self.assertTrue(response.data["whatsapp_reproductive_alerts"])
        response = self.client.patch(reverse("auth_me"), {"full_name": "Atualizado"}, format="multipart")
        self.assertTrue(response.data["whatsapp_reproductive_alerts"])
        response = self.client.patch(reverse("auth_me"), {"phone_is_whatsapp": "false"}, format="multipart")
        self.assertFalse(response.data["whatsapp_reproductive_alerts"])
        self.assertFalse(self.client.get(reverse("auth_me")).data["phone_is_whatsapp"])

    def test_invalid_consent_or_missing_phone_is_rejected(self):
        response = self.client.patch(reverse("auth_me"), {"whatsapp_reproductive_alerts": "true"}, format="multipart")
        self.assertEqual(response.status_code, 400)
        serializer = UserCreateSerializer(data={"email": "invalid@example.com", "full_name": "Novo", "password": "password123", "password_confirm": "password123", "phone_is_whatsapp": True})
        self.assertFalse(serializer.is_valid())
        self.assertIn("phone", serializer.errors)

    def test_member_create_and_edit_keep_existing_channels(self):
        response = self.client.post(reverse("auth_members_create"), {"email": "member@example.com", "full_name": "Membro", "password": "password123", "password_confirm": "password123", "phone": "81999990000", "phone_is_whatsapp": True, "receive_system_alerts": True}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        member = User.objects.get(pk=response.data["id"])
        self.assertTrue(member.check_password("password123"))
        preference = member.notification_preference
        preference.email_notifications = False
        preference.save()
        response = self.client.patch(reverse("auth_member_detail", args=[member.pk]), {"receive_system_alerts": False}, format="json")
        self.assertEqual(response.status_code, 200)
        preference.refresh_from_db()
        member.refresh_from_db()
        self.assertFalse(member.receive_system_alerts)
        self.assertTrue(preference.whatsapp_reproductive_alerts)
        self.assertFalse(preference.email_notifications)

    @patch("apps.notifications.tasks.wpp_request")
    def test_revoked_consent_blocks_pending_delivery(self, transport):
        self.user.phone_is_whatsapp = True
        self.user.save()
        preference = NotificationPreference.objects.create(user=self.user, whatsapp_reproductive_alerts=False)
        notification = Notification.objects.create(user=self.user, title="Alerta", message="Hoje", type=NotificationType.ANIMAL)
        sent, detail = _send_whatsapp_web(notification)
        self.assertFalse(sent)
        self.assertIn("não autorizou", detail)
        preference.whatsapp_reproductive_alerts = True
        preference.save()
        self.user.phone_is_whatsapp = False
        self.assertFalse(_send_whatsapp_web(notification)[0])
        transport.assert_not_called()

    def test_contact_without_whatsapp_does_not_schedule_channel(self):
        NotificationPreference.objects.create(user=self.user, whatsapp_reproductive_alerts=True)
        notification = NotificationService.create(self.user, "Vacina", "Hoje", notif_type=NotificationType.ANIMAL, event_key="livestock.reproductive_vaccine.test")
        self.assertFalse(notification.deliveries.filter(channel=NotificationDelivery.Channel.WHATSAPP_WEB).exists())

    def test_master_checkbox_is_independent_of_whatsapp_and_categories(self):
        pref = NotificationPreference.objects.create(user=self.user, email_notifications=False, stock_alerts=False)
        response = self.client.patch(reverse("auth_me"), {"receive_system_alerts": "true", "phone_is_whatsapp": "false"}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["receive_system_alerts"])
        self.assertFalse(response.data["phone_is_whatsapp"])
        self.assertIsNotNone(NotificationService.create(self.user, "Sistema", "Aviso"))
        pref.refresh_from_db()
        self.assertFalse(pref.email_notifications)
        self.assertFalse(pref.stock_alerts)
        self.client.patch(reverse("auth_me"), {"receive_system_alerts": "false"}, format="multipart")
        for category in NotificationType.values:
            self.assertIsNone(NotificationService.create(self.user, "Alerta", "Aviso", notif_type=category))

    @patch("apps.notifications.tasks.wpp_request")
    @patch("apps.notifications.emails.send_mail")
    def test_master_opt_out_skips_all_pending_channels_and_digests(self, send_mail, transport):
        self.user.receive_system_alerts = False
        self.user.save()
        notification = Notification.objects.create(user=self.user, title="Anterior", message="Aviso")
        for channel in NotificationDelivery.Channel.values:
            NotificationDelivery.objects.create(notification=notification, channel=channel)
        dispatch_notification.run(str(notification.pk))
        self.assertEqual(notification.deliveries.filter(status=NotificationDelivery.Status.SKIPPED).count(), 3)
        EmailNotificationService.send_notification_email(self.user, notification)
        EmailNotificationService.send_daily_digest(self.user)
        EmailNotificationService.send_weekly_digest(self.user)
        transport.assert_not_called()
        send_mail.assert_not_called()
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())
