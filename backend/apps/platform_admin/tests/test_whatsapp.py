import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.notifications.tasks import _send_whatsapp_web
from apps.platform_admin import views
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

    @override_settings(WPP_CONNECT_TOKEN="", WPP_CONNECT_SECRET="test-secret")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_alert_authenticates_with_secret_without_fixed_token(self, open_url):
        token_response = MagicMock()
        token_response.__enter__.return_value.read.return_value = json.dumps({"token": "generated-test-token"}).encode()
        send_response = MagicMock()
        send_response.__enter__.return_value.read.return_value = b'{"status":"success"}'
        open_url.side_effect = [token_response, send_response]
        notification = SimpleNamespace(user=SimpleNamespace(phone="81999990000"), title="Vacina", message="Hoje")
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
