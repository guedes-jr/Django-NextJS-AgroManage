import subprocess
from datetime import timedelta
from unittest.mock import patch

from common.wppconnect import wpp_request, wpp_session_names
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import (
    PlatformAuditLog,
    PlatformStaffProfile,
    WhatsAppSessionObservation,
)
from apps.platform_admin.whatsapp import (
    observed_session,
    operate_session,
    restart_service,
    session_names,
)


@override_settings(WPP_CONNECT_SESSION="agromanage", WPP_CONNECT_URL="http://wpp.test", WPP_CONNECT_SECRET="test-secret", WPP_CONNECT_TOKEN="test-token", WPP_CONNECT_RECOVERY_ENABLED=False)
class SessionServiceTests(TestCase):
    def setUp(self):
        self.now = timezone.now()

    def observation(self, status="INITIALIZING", seconds=130):
        return WhatsAppSessionObservation.objects.create(name="agromanage", status=status, state_since=self.now - timedelta(seconds=seconds), observed_at=self.now)

    @patch("apps.platform_admin.whatsapp.timezone.now")
    def test_persistent_initialization_is_suspected(self, now):
        now.return_value = self.now
        self.observation()
        row = observed_session("agromanage", ({"status": "INITIALIZING"}, None))
        self.assertTrue(row["suspected_stuck"])
        self.assertEqual(row["elapsed_seconds"], 130)

    @patch("apps.platform_admin.whatsapp.timezone.now")
    def test_first_observation_and_qr_wait_are_not_stuck(self, now):
        now.return_value = self.now
        row = observed_session("agromanage", ({"status": "INITIALIZING"}, None))
        self.assertFalse(row["suspected_stuck"])
        WhatsAppSessionObservation.objects.all().delete()
        self.observation("QRCODE", 3600)
        row = observed_session("agromanage", ({"status": "QRCODE"}, None))
        self.assertFalse(row["suspected_stuck"])

    @patch("apps.platform_admin.whatsapp.timezone.now")
    def test_state_change_resets_elapsed_and_records_only_sanitized_errors(self, now):
        now.return_value = self.now
        self.observation()
        row = observed_session("agromanage", (None, "Serviço indisponível"))
        self.assertEqual(row["elapsed_seconds"], 0)
        self.assertEqual(row["last_error"], "Serviço indisponível")
        row = observed_session("agromanage", ({"status":"CONNECTED"}, None))
        self.assertFalse(row["suspected_stuck"])
        self.assertEqual(row["last_error"], "Serviço indisponível")

    @patch("common.wppconnect.wpp_session_names", return_value=(["another", "../private", "@service", "another", {"token": "hidden"}], ""))
    def test_inventory_filters_names_and_includes_default(self, inventory):
        names, detail = session_names()
        self.assertEqual(names, ["agromanage", "another"])
        self.assertEqual(detail, "")

    @patch("apps.platform_admin.whatsapp.wpp_request", return_value=({"status": "CLOSED"}, None))
    def test_closing_closed_session_is_idempotent(self, transport):
        result, detail, recovery = operate_session("agromanage", "close")
        self.assertEqual(result["status"], "CLOSED")
        self.assertIsNone(detail)
        self.assertFalse(recovery)
        transport.assert_called_once_with("status-session", session_name="agromanage")

    @patch("apps.platform_admin.whatsapp.wpp_request", side_effect=[({"status": "CONNECTED"}, None), ({"status": True}, None)])
    def test_close_preserves_pairing_without_logout(self, transport):
        result, detail, recovery = operate_session("another", "close")
        self.assertEqual(result["status"], "CLOSED")
        self.assertFalse(recovery)
        self.assertIsNone(detail)
        self.assertEqual([call.args[0] for call in transport.call_args_list], ["status-session", "close-session"])
        self.assertTrue(all(call.kwargs["session_name"] == "another" for call in transport.call_args_list))

    @patch("apps.platform_admin.whatsapp.wpp_request", return_value=({"status": "INITIALIZING"}, None))
    def test_placeholder_close_requires_explicit_global_recovery(self, transport):
        self.observation()
        result, detail, recovery = operate_session("agromanage", "close")
        self.assertIsNone(result)
        self.assertTrue(recovery)
        self.assertIn("todas as sessões", detail)
        self.assertEqual(transport.call_count, 1)

    @patch("apps.platform_admin.whatsapp.wpp_request", side_effect=[({"status": "CONNECTED"}, None), (None, "HTTP 500")])
    def test_close_failure_is_not_reported_as_closed(self, transport):
        self.observation("CONNECTED")
        result, detail, recovery = operate_session("agromanage", "close")
        self.assertIsNone(result)
        self.assertTrue(recovery)
        self.assertEqual(detail, "HTTP 500")
        self.assertEqual(WhatsAppSessionObservation.objects.get(name="agromanage").last_error, "HTTP 500")

    @patch("apps.platform_admin.whatsapp.wpp_request", side_effect=[({"status": "CLOSED"}, None), ({"status": "STARTING"}, None)])
    def test_reconnect_uses_requested_session_and_omits_qr(self, transport):
        result, detail, recovery = operate_session("another", "reconnect")
        self.assertIsNone(detail)
        self.assertFalse(recovery)
        self.assertEqual(result["status"], "STARTING")
        self.assertNotIn("qrcode", result)
        self.assertEqual(transport.call_args.kwargs["session_name"], "another")

    @patch("subprocess.run")
    def test_recovery_disabled_does_not_execute_command(self, command):
        succeeded, detail = restart_service()
        self.assertFalse(succeeded)
        self.assertIn("não está habilitada", detail)
        command.assert_not_called()

    @override_settings(WPP_CONNECT_RECOVERY_ENABLED=True, WPP_CONNECT_URL="http://127.0.0.1:21465")
    @patch("subprocess.run")
    def test_recovery_uses_only_fixed_command_and_cooldown(self, command):
        self.observation()
        succeeded, detail = restart_service()
        self.assertTrue(succeeded)
        command.assert_called_once_with(["sudo", "-n", "/usr/local/sbin/agromanage-wppconnect-control", "restart"], check=True, timeout=35, capture_output=True)
        succeeded, detail = restart_service()
        self.assertFalse(succeeded)
        self.assertIn("60 segundos", detail)
        self.assertEqual(command.call_count, 1)

    @override_settings(WPP_CONNECT_RECOVERY_ENABLED=True, WPP_CONNECT_URL="http://127.0.0.1:21465")
    @patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "sudo", stderr=b"secret-do-not-expose"))
    def test_recovery_failure_does_not_expose_process_output(self, command):
        succeeded, detail = restart_service()
        self.assertFalse(succeeded)
        self.assertNotIn("secret-do-not-expose", detail)

    @override_settings(WPP_CONNECT_SECRET="")
    @patch("common.wppconnect.urlrequest.urlopen")
    def test_token_only_cannot_be_used_for_other_sessions(self, transport):
        data, detail = wpp_request("status-session", session_name="another")
        self.assertIsNone(data)
        self.assertIn("chave secreta", detail)
        transport.assert_not_called()
        names, detail = wpp_session_names()
        self.assertEqual(names, ["agromanage"])


@override_settings(WPP_CONNECT_RECOVERY_ENABLED=True, WPP_CONNECT_URL="http://127.0.0.1:21465")
class SessionManagementAPITests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(email="wa-control-admin@test.local", password="test", full_name="Admin")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        org = Organization.objects.create(name="Cliente", slug="wa-control-client")
        self.tenant_admin = user_model.objects.create_user(email="wa-control-tenant@test.local", password="test", full_name="Cliente", organization=org, role="admin")
        self.client.force_authenticate(self.admin)

    def action_url(self, name="agromanage"):
        return reverse("platform-whatsapp-web-session-action", args=[name])

    @patch("apps.platform_admin.views.session_names", return_value=(["agromanage", "another"], ""))
    @patch("common.wppconnect.wpp_request", return_value=({"status": "CONNECTED"}, None))
    def test_list_returns_safe_observation_metadata(self, transport, inventory):
        result = self.client.get(reverse("platform-whatsapp-web-sessions"))
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["count"], 2)
        self.assertEqual(len(result.data["results"]), 2)
        self.assertTrue(result.data["recovery_enabled"])
        self.assertNotIn("qrcode", result.data["results"][0])
        self.assertNotIn("token", str(result.data))

    @patch("apps.platform_admin.views.session_names", return_value=([f"session{i}" for i in range(7)], ""))
    @patch("common.wppconnect.wpp_request", return_value=({"status": "CLOSED"}, None))
    def test_list_is_bounded_and_paginated(self, transport, inventory):
        result = self.client.get(reverse("platform-whatsapp-web-sessions"))
        self.assertEqual(len(result.data["results"]), 6)
        self.assertTrue(result.data["has_next"])
        next_page = self.client.get(reverse("platform-whatsapp-web-sessions"), {"page": 2})
        self.assertEqual(len(next_page.data["results"]), 1)
        self.assertEqual(self.client.get(reverse("platform-whatsapp-web-sessions"), {"page": "bad"}).status_code, 400)

    @patch("apps.platform_admin.views.operate_session")
    def test_close_requires_confirmation(self, operation):
        result = self.client.post(self.action_url(), {"operation":"close"}, format="json")
        self.assertEqual(result.status_code, 400)
        operation.assert_not_called()

    @patch("apps.platform_admin.views.session_names", return_value=(["agromanage"], ""))
    @patch("apps.platform_admin.views.operate_session")
    def test_unknown_session_is_not_operated(self, operation, inventory):
        result = self.client.post(self.action_url("another"), {"operation":"close", "confirm":True}, format="json")
        self.assertEqual(result.status_code, 404)
        operation.assert_not_called()

    @patch("apps.platform_admin.views.session_names", return_value=(["agromanage"], ""))
    @patch("apps.platform_admin.views.operate_session", return_value=({"status":"CLOSED", "detail":"Pareamento preservado"}, None, False))
    def test_successful_close_creates_audit_record(self, operation, inventory):
        result = self.client.post(self.action_url(), {"operation":"close", "confirm":True}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(PlatformAuditLog.objects.filter(actor=self.admin, action="whatsapp.session_close", object_id="agromanage").exists())

    @patch("apps.platform_admin.views.session_names", return_value=(["agromanage"], ""))
    @patch("apps.platform_admin.views.operate_session", return_value=(None, "Reiniciar o serviço", True))
    def test_placeholder_failure_requires_explicit_recovery_and_is_audited(self, operation, inventory):
        result = self.client.post(self.action_url(), {"operation":"close", "confirm":True}, format="json")
        self.assertEqual(result.status_code, 409)
        self.assertTrue(result.data["recovery_required"])
        self.assertTrue(PlatformAuditLog.objects.filter(action="whatsapp.session_operation_failed").exists())

    @patch("apps.platform_admin.views.restart_service", return_value=(True, "Serviço reiniciado"))
    def test_restart_requires_confirmation_and_records_request_and_result(self, restart):
        url = reverse("platform-whatsapp-web-restart-service")
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        restart.assert_not_called()
        result = self.client.post(url, {"confirm_all_sessions":True}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(PlatformAuditLog.objects.filter(actor=self.admin, action__in=["whatsapp.service_restart_requested", "whatsapp.service_restarted"]).count(), 2)

    @patch("apps.platform_admin.views.restart_service")
    @patch("apps.platform_admin.views.operate_session")
    def test_tenant_admin_cannot_list_close_or_restart(self, operate, restart):
        self.client.force_authenticate(self.tenant_admin)
        self.assertEqual(self.client.get(reverse("platform-whatsapp-web-sessions")).status_code, 403)
        self.assertEqual(self.client.post(self.action_url(), {"operation":"close", "confirm":True}, format="json").status_code, 403)
        self.assertEqual(self.client.post(reverse("platform-whatsapp-web-restart-service"), {"confirm_all_sessions":True}, format="json").status_code, 403)
        operate.assert_not_called(); restart.assert_not_called()

    def test_platform_auditor_and_anonymous_cannot_manage_sessions(self):
        profile = self.admin.platform_staff_profile
        profile.role = PlatformStaffProfile.Role.AUDITOR
        profile.save(update_fields=["role"])
        for user in [self.admin, None]:
            self.client.force_authenticate(user)
            self.assertIn(self.client.get(reverse("platform-whatsapp-web-sessions")).status_code, (401, 403))
            self.assertIn(self.client.post(reverse("platform-whatsapp-web-restart-service"), {"confirm_all_sessions":True}, format="json").status_code, (401, 403))

    @override_settings(WPP_CONNECT_URL="http://remote.test:21465")
    @patch("subprocess.run")
    def test_remote_wpp_cannot_restart_local_container(self, command):
        from apps.platform_admin.whatsapp import restart_service
        succeeded, detail = restart_service()
        self.assertFalse(succeeded)
        self.assertIn("não está habilitada", detail)
        command.assert_not_called()
