from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.notifications.models import TelegramConnection
from apps.organizations.models import Organization


@override_settings(TELEGRAM_BOT_USERNAME="AgroManageTestBot", TELEGRAM_WEBHOOK_SECRET="test-telegram-secret")
class TelegramConnectionTests(APITestCase):
    connection = "/api/v1/notifications/telegram/connection/"
    webhook = "/api/v1/notifications/telegram/webhook/"

    def setUp(self):
        users = get_user_model().objects
        for label in ("first", "second"):
            organization = Organization.objects.create(name=label, slug=label)
            setattr(self, label, users.create_user(
                email=f"{label}@example.invalid", password="test", organization=organization, role="manager",
            ))
        self.client.force_authenticate(self.first)

    def start(self):
        response = self.client.post(self.connection)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response["Cache-Control"], "no-store")
        return parse_qs(urlsplit(response.data["link"]).query)["start"][0]

    def update(self, command, chat_id=123, chat_type="private", secret="test-telegram-secret"):
        return APIClient().post(self.webhook, {
            "update_id": 5,
            "message": {
                "chat": {"id": chat_id, "type": chat_type},
                "from": {"id": chat_id},
                "date": int(timezone.now().timestamp()),
                "text": command,
            },
        }, format="json", HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=secret)

    def test_link_requires_private_authenticated_webhook_and_confirmation(self):
        code = self.start()
        command = f"/start {code}"
        self.assertNotEqual(TelegramConnection.objects.get(user=self.first).challenge_hash, code)
        self.assertEqual(self.update(command, secret="wrong").status_code, 403)
        self.assertEqual(self.update(command, chat_type="group").status_code, 204)
        self.assertEqual(self.client.post(self.connection + "confirm/").status_code, 409)
        self.assertEqual(self.update(command).status_code, 204)
        self.assertEqual(self.update(command, chat_id=456).status_code, 204)
        self.assertEqual(self.client.get(self.connection).data, {"status": "ready_to_confirm"})
        self.assertEqual(self.client.post(self.connection + "confirm/").data, {"status": "connected"})
        self.assertEqual(TelegramConnection.objects.get(user=self.first).chat_id, 123)
        self.assertEqual(self.update("/stop").status_code, 204)
        self.assertEqual(self.client.get(self.connection).data, {"status": "disconnected"})

    def test_selected_phone_requires_a_matching_contact_from_the_chat_owner(self):
        self.first.phone = "81999990000"
        self.first.phone_is_telegram = True
        self.first.save(update_fields=["phone", "phone_is_telegram"])
        with patch("apps.notifications.telegram._request_phone") as request_phone:
            self.update(f"/start {self.start()}")
            request_phone.assert_called_once_with(123)
        self.assertEqual(self.client.get(self.connection).data["status"], "awaiting_phone")
        self.assertEqual(self.client.post(self.connection + "confirm/").status_code, 409)
        for owner, phone in [(456, "+5581999990000"), (123, "+5581999991111"), (123, "+5581999990000")]:
            result = APIClient().post(self.webhook, {"message": {
                "chat": {"id": 123, "type": "private"}, "from": {"id": 123},
                "contact": {"user_id": owner, "phone_number": phone},
            }}, format="json", HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="test-telegram-secret")
            self.assertEqual(result.status_code, 204)
            self.assertEqual(self.client.get(self.connection).data["status"],
                             "ready_to_confirm" if owner == 123 and phone.endswith("90000") else "awaiting_phone")
        self.assertEqual(self.client.post(self.connection + "confirm/").data, {"status": "connected"})

    def test_account_isolation_and_unique_chat(self):
        self.update(f"/start {self.start()}")
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.get(self.connection).data, {"status": "disconnected"})
        self.update(f"/start {self.start()}")
        self.client.force_authenticate(self.first)
        self.assertEqual(self.client.post(self.connection + "confirm/").status_code, 200)
        self.client.force_authenticate(self.second)
        self.assertEqual(self.client.post(self.connection + "confirm/").status_code, 409)
        self.client.delete(self.connection)
        self.assertTrue(TelegramConnection.objects.filter(user=self.first, chat_id=123).exists())

    def test_expired_or_replaced_challenge_cannot_link(self):
        obsolete = self.start()
        current = self.start()
        self.update(f"/start {obsolete}")
        self.assertEqual(self.client.get(self.connection).data, {"status": "awaiting_telegram"})
        TelegramConnection.objects.filter(user=self.first).update(expires_at=timezone.now())
        self.update(f"/start {current}")
        self.assertEqual(self.client.get(self.connection).data, {"status": "disconnected"})
        self.assertEqual(self.client.post(self.connection + "confirm/").status_code, 409)

@override_settings(TELEGRAM_BOT_TOKEN="123:fake", FRONTEND_URL="https://example.invalid")
class TelegramTransportTests(SimpleTestCase):
    @patch("apps.notifications.telegram_delivery.HTTPSConnection")
    def test_rate_limit_uses_retry_after_and_payload_contains_only_generic_message(self, connect):
        import json

        from apps.notifications.telegram_delivery import _send_message

        response = connect.return_value.getresponse.return_value
        response.status = 429
        response.read.return_value = b'{"ok":false,"parameters":{"retry_after":45}}'
        self.assertEqual(_send_message(123, "/home"), ("pending", "Limite de envio do Telegram.", 45))
        connect.assert_called_once_with("api.telegram.org", timeout=8)
        method, path, body, headers = connect.return_value.request.call_args.args
        self.assertEqual((method, path, headers), (
            "POST", "/bot123:fake/sendMessage", {"Content-Type": "application/json"},
        ))
        self.assertEqual(json.loads(body), {
            "chat_id": 123,
            "text": "Você tem um alerta de reprodução ou vacinação no AgroManage.\nhttps://example.invalid/home",
            "link_preview_options": {"is_disabled": True},
        })
        response.status = 200
        response.read.return_value = b'{"ok":true}'
        self.assertEqual(_send_message(123, "/home"), ("sent", "", None))
        response.read.return_value = b'invalid'
        self.assertEqual(_send_message(123, "/home")[0], "unknown")
