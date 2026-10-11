import json
import socket
from urllib.error import HTTPError, URLError
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from apps.notifications.models import Notification, NotificationDelivery, NotificationPreference
from apps.notifications.tasks import _send_whatsapp_web
from apps.organizations.models import Organization
from apps.platform_admin import views
from apps.platform_admin.models import PlatformStaffProfile
from common.wppconnect import wpp_request


@override_settings(WPP_CONNECT_URL="http://wpp.test", WPP_CONNECT_SESSION="test-session",
                   WPP_CONNECT_TOKEN="test-token", WPP_CONNECT_SECRET="")
class WhatsAppFlowTests(SimpleTestCase):
    def call_view(self, view, method="get"):
        request = getattr(APIRequestFactory(), method)("/", {}, format="json")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))
        with patch("common.permissions.IsPlatformAdmin.has_permission", return_value=True):
            return view(request)

    @patch("apps.platform_admin.views._wpp_request")
    def test_connection_boolean_and_legacy_statuses(self, transport):
        for value, expected in [(True, True), (False, False), ("CONNECTED", True), ("isLogged", True), ("CONNECTING", False)]:
            with self.subTest(value=value):
                transport.return_value = ({"status": value}, None)
                result = self.call_view(views.whatsapp_web_status)
                self.assertEqual(result.data["connected"], expected)
                self.assertIsInstance(result.data["status"], str)

    @patch("apps.platform_admin.views._wpp_request", return_value=({"status": "QRCODE", "qrcode": "data:image/png;base64,test"}, None))
    def test_qr_uses_json_session_state(self, transport):
        result = self.call_view(views.whatsapp_web_qrcode)
        transport.assert_called_once_with("status-session")
        self.assertEqual(result.data["qrcode"], "data:image/png;base64,test")

    @patch("apps.platform_admin.views._wpp_request", return_value=(None, "Serviço indisponível"))
    def test_start_error_is_not_reported_as_generating(self, transport):
        result = self.call_view(views.whatsapp_web_start, "post")
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.data["status"], "unavailable")
        transport.assert_called_once_with("start-session", method="POST", payload={"waitQrCode": False})

    @patch("apps.notifications.models.NotificationPreference.objects.filter")
    @override_settings(WPP_CONNECT_TOKEN="", WPP_CONNECT_SECRET="test-secret")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_alert_authenticates_with_secret_without_fixed_token(self, open_url, preference_filter):
        preference_filter.return_value.exists.return_value = True
        token_response = MagicMock()
        token_response.__enter__.return_value.read.return_value = json.dumps({"token": "generated-test-token"}).encode()
        send_response = MagicMock()
        send_response.__enter__.return_value.read.return_value = b'{"status":"success"}'
        open_url.side_effect = [token_response, send_response]
        notification = SimpleNamespace(user=SimpleNamespace(phone="81999990000", phone_is_whatsapp=True, receive_system_alerts=True), title="Vacina", message="Hoje")
        self.assertEqual(_send_whatsapp_web(notification), (True, ""))
        outbound = open_url.call_args_list[1].args[0]
        self.assertEqual(outbound.get_header("Authorization"), "Bearer generated-test-token")
        self.assertEqual(json.loads(outbound.data)["phone"], "5581999990000")

    @patch("common.wppconnect.urlrequest.urlopen")
    def test_http_success_with_send_failure_is_not_delivery(self, open_url):
        open_url.return_value.__enter__.return_value.read.return_value = b'{"status":false}'
        data, detail = wpp_request("send-message", method="POST", payload={})
        self.assertIsNone(data)
        self.assertTrue(detail)

    @patch("common.wppconnect.urlrequest.urlopen", side_effect=TimeoutError)
    def test_timeout_is_reported(self, open_url):
        data, detail = wpp_request("start-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertTrue(detail)

    @patch("apps.platform_admin.whatsapp.wpp_request", return_value=({"response": {"pushname": "Fazenda Teste", "phoneNumber": "5581999990000@c.us"}}, None))
    def test_account_returns_only_name_and_phone(self, transport):
        result = self.call_view(views.whatsapp_web_account)
        self.assertEqual(result.data["account"], {"name": "Fazenda Teste", "phone": "5581999990000"})
        transport.assert_called_once_with("host-device")

    @patch("apps.platform_admin.whatsapp.wpp_request", return_value=(None, "Dados indisponíveis"))
    def test_missing_account_is_explicit(self, transport):
        result = self.call_view(views.whatsapp_web_account)
        self.assertIsNone(result.data["account"])
        self.assertEqual(result.data["detail"], "Dados indisponíveis")

    @patch("apps.platform_admin.views.record_platform_action")
    @patch("apps.platform_admin.views._wpp_request", side_effect=[({"status": "CONNECTED"}, None), ({"status": True}, None), ({"status": "STARTING"}, None)])
    def test_reconnect_preserves_pairing_and_records_audit(self, transport, audit):
        result = self.call_view(views.whatsapp_web_reconnect, "post")
        self.assertEqual(result.status_code, 200)
        self.assertEqual([call.args[0] for call in transport.call_args_list], ["status-session", "close-session", "start-session"])
        audit.assert_called_once()

    @patch("apps.platform_admin.views.record_platform_action")
    @patch("apps.platform_admin.views._wpp_request", side_effect=[({"status": "CONNECTED"}, None), (None, "Não foi possível fechar")])
    def test_reconnect_does_not_start_after_close_failure(self, transport, audit):
        result = self.call_view(views.whatsapp_web_reconnect, "post")
        self.assertEqual(result.status_code, 503)
        self.assertEqual([call.args[0] for call in transport.call_args_list], ["status-session", "close-session"])
        audit.assert_not_called()

    @patch("apps.platform_admin.views._wpp_request", side_effect=[({"status": False}, None), ({"status": "SYNCING"}, None)])
    def test_status_exposes_pairing_stage(self, transport):
        result = self.call_view(views.whatsapp_web_status)
        self.assertEqual(result.data["status"], "SYNCING")
        self.assertFalse(result.data["connected"])
        self.assertIn("checked_at", result.data)

    @patch("common.wppconnect.urlrequest.urlopen")
    def test_explicit_lifecycle_failure_is_not_success(self, open_url):
        open_url.return_value.__enter__.return_value.read.return_value = b'{"status":"Error"}'
        data, detail = wpp_request("close-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertTrue(detail)

    @patch("apps.platform_admin.views._wpp_request", side_effect=[({"status": False}, None), (None, "Consulta do QR indisponível")])
    def test_pairing_lookup_error_is_visible(self, transport):
        result = self.call_view(views.whatsapp_web_status)
        self.assertEqual(result.data["status"], "unavailable")
        self.assertEqual(result.data["detail"], "Consulta do QR indisponível")
        self.assertIsNone(result.data["qrcode"])

    @override_settings(WPP_CONNECT_URL="")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_missing_configuration_reports_required_settings(self, transport):
        data, detail = wpp_request("start-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertIn("WPP_CONNECT_URL", detail)
        transport.assert_not_called()

    @override_settings(WPP_CONNECT_URL="http://wpp.test:invalid")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_invalid_url_reports_configuration_error(self, transport):
        data, detail = wpp_request("start-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertIn("WPP_CONNECT_URL inválida", detail)
        transport.assert_not_called()

    @override_settings(WPP_CONNECT_TOKEN="", WPP_CONNECT_SECRET="secret-not-to-expose")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_auth_connection_failure_is_not_misreported_as_credentials(self, transport):
        transport.side_effect = URLError(ConnectionRefusedError())
        data, detail = wpp_request("start-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertIn("recusou a conexão", detail)
        self.assertNotIn("secret-not-to-expose", detail)

    @override_settings(WPP_CONNECT_TOKEN="", WPP_CONNECT_SECRET="secret-not-to-expose")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_auth_http_failures_are_actionable_and_do_not_expose_secret(self, transport):
        for code, expected in [(401, "autenticação"), (404, "rota"), (500, "erro interno")]:
            with self.subTest(code=code):
                transport.side_effect = HTTPError("http://wpp.test/secret-not-to-expose", code, "secret-not-to-expose", {}, None)
                data, detail = wpp_request("start-session", method="POST", payload={})
                self.assertIsNone(data)
                self.assertIn(expected, detail)
                self.assertNotIn("secret-not-to-expose", detail)

    @patch("common.wppconnect.urlrequest.urlopen")
    def test_dns_failure_is_actionable(self, transport):
        transport.side_effect = URLError(socket.gaierror())
        data, detail = wpp_request("status-session")
        self.assertIsNone(data)
        self.assertIn("DNS", detail)

    @override_settings(WPP_CONNECT_TOKEN="", WPP_CONNECT_SECRET="test-secret")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_missing_generated_token_does_not_continue_to_session_request(self, transport):
        transport.return_value.__enter__.return_value.read.return_value = b'{"token":null}'
        data, detail = wpp_request("start-session", method="POST", payload={})
        self.assertIsNone(data)
        self.assertIn("token válido", detail)
        self.assertEqual(transport.call_count, 1)

    @patch("common.wppconnect.urlrequest.urlopen")
    def test_invalid_json_response_is_not_misreported_as_network(self, transport):
        transport.return_value.__enter__.return_value.read.return_value = b'<html>invalid upstream</html>'
        data, detail = wpp_request("status-session")
        self.assertIsNone(data)
        self.assertIn("resposta inválida", detail)

    @patch("apps.platform_admin.views.record_platform_action")
    @patch("apps.platform_admin.views._wpp_request", side_effect=[({"status": "CLOSED"}, None), ({"status": "STARTING"}, None)])
    def test_reconnect_closed_session_starts_without_closing_placeholder(self, transport, audit):
        response = self.call_view(views.whatsapp_web_reconnect, "post")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([call.args[0] for call in transport.call_args_list], ["status-session", "start-session"])
        audit.assert_called_once()

    @patch("apps.platform_admin.views.record_platform_action")
    @patch("apps.platform_admin.views._wpp_request")
    def test_reconnect_does_not_close_client_while_initializing(self, transport, audit):
        for state in ["INITIALIZING", "QRCODE", "CONNECTING", "SYNCING"]:
            with self.subTest(state=state):
                transport.reset_mock()
                transport.return_value = ({"status": state}, None)
                response = self.call_view(views.whatsapp_web_reconnect, "post")
                self.assertEqual(response.status_code, 409)
                transport.assert_called_once_with("status-session")
        audit.assert_not_called()


class WhatsAppAlertsTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.org = Organization.objects.create(name="Fazenda A", slug="whatsapp-fazenda-a")
        self.other_org = Organization.objects.create(name="Fazenda B", slug="whatsapp-fazenda-b")
        self.admin = user_model.objects.create_user(email="wa-admin@test.local", password="test", full_name="Admin")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.recipient = user_model.objects.create_user(email="wa-user@test.local", password="test", full_name="Responsável", organization=self.org, phone="81999990000", phone_is_whatsapp=True, role="admin")
        self.other = user_model.objects.create_user(email="wa-other@test.local", password="test", full_name="Outro", organization=self.other_org, phone="+1 555 123 4567", phone_is_whatsapp=True, role="owner")
        for user in [self.recipient, self.other]:
            NotificationPreference.objects.update_or_create(user=user, defaults={"whatsapp_reproductive_alerts": True, "animal_alerts": True})
        self.client.force_authenticate(self.admin)

    def delivery(self, recipient=None, channel="whatsapp_web", status="sent"):
        notification = Notification.objects.create(user=recipient or self.recipient, title="Vacina programada", message="Hoje", type="animal")
        return NotificationDelivery.objects.create(notification=notification, channel=channel, status=status, attempts=1)

    def test_summary_counts_valid_opted_in_users_and_whatsapp_deliveries_only(self):
        self.delivery()
        self.delivery(self.other, status="failed")
        self.delivery(channel="email")
        response = self.client.get(reverse("platform-whatsapp-web-alerts"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        overview = response.data["overview"]
        self.assertEqual(overview["eligible_users"], 1)
        self.assertEqual(overview["opted_in_users"], 2)
        self.assertEqual(overview["invalid_phone_users"], 1)
        self.assertEqual(overview["counts"], {"sent": 1, "failed": 1, "pending": 0, "skipped": 0, "unknown": 0})
        self.assertEqual({row["organization"] for row in response.data["results"]}, {"Fazenda A", "Fazenda B"})

    def test_disabled_animal_preferences_and_inactive_users_are_excluded(self):
        NotificationPreference.objects.filter(user=self.recipient).update(animal_alerts=False)
        self.other.is_active = False
        self.other.save(update_fields=["is_active"])
        response = self.client.get(reverse("platform-whatsapp-web-alerts"))
        self.assertEqual(response.data["overview"]["opted_in_users"], 0)

    def test_status_filter_keeps_global_counts(self):
        self.delivery(status="sent")
        failed = self.delivery(status="failed")
        response = self.client.get(reverse("platform-whatsapp-web-alerts"), {"status": "failed"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(failed.id))
        self.assertEqual(response.data["overview"]["counts"]["sent"], 1)
        self.assertEqual(self.client.get(reverse("platform-whatsapp-web-alerts"), {"status": "invalid"}).status_code, 400)

    def test_history_is_paginated(self):
        for _ in range(21):
            self.delivery()
        response = self.client.get(reverse("platform-whatsapp-web-alerts"))
        self.assertEqual(len(response.data["results"]), 20)
        self.assertEqual(response.data["count"], 21)
        self.assertIsNotNone(response.data["next"])
        second = self.client.get(reverse("platform-whatsapp-web-alerts"), {"page": 2})
        self.assertEqual(len(second.data["results"]), 1)

    def test_tenant_admin_cannot_access_platform_whatsapp_data_or_actions(self):
        self.recipient.role = "admin"
        self.recipient.save(update_fields=["role"])
        self.client.force_authenticate(self.recipient)
        for endpoint in ["status", "account", "alerts", "qrcode", "messages"]:
            self.assertEqual(self.client.get(reverse(f"platform-whatsapp-web-{endpoint}")).status_code, 403)
        for endpoint in ["reconnect", "disconnect", "start"]:
            self.assertEqual(self.client.post(reverse(f"platform-whatsapp-web-{endpoint}"), {}, format="json").status_code, 403)

    def test_operator_with_valid_phone_is_not_counted_as_scheduled_event_recipient(self):
        self.recipient.role = "operator"
        self.recipient.save(update_fields=["role"])
        response = self.client.get(reverse("platform-whatsapp-web-alerts"))
        self.assertEqual(response.data["overview"]["eligible_users"], 0)
        self.assertEqual(response.data["overview"]["opted_in_users"], 2)
        self.assertEqual(response.data["overview"]["invalid_phone_users"], 1)
