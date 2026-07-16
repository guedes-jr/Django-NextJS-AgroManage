from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import override_settings
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import DeveloperSandboxGrant, PlatformStaffProfile, SandboxExecution

User = get_user_model()


class SandboxGrantAPITestCase(APITestCase):
    def setUp(self):
        self.developer = User.objects.create_user(email="sandbox-dev@platform.local", password="Password-8472", full_name="Dev")
        PlatformStaffProfile.objects.create(user=self.developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.admin = User.objects.create_user(email="sandbox-admin@platform.local", password="Password-8472", full_name="Admin")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)

    def request_grant(self):
        self.client.force_authenticate(self.developer)
        return self.client.post(
            reverse("platform-sandbox-grant-list"),
            {"justification": "Investigar incidente operacional INC-1042", "requested_minutes": 20},
            format="json",
        )

    def test_requires_second_person_to_approve_and_allows_revoke(self):
        created = self.request_grant()
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        grant_id = created.data["id"]

        self.client.force_authenticate(self.developer)
        self.assertEqual(
            self.client.post(reverse("platform-sandbox-grant-approve", args=[grant_id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.admin)
        approved = self.client.post(reverse("platform-sandbox-grant-approve", args=[grant_id]))
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertTrue(approved.data["is_valid"])

        self.client.force_authenticate(self.developer)
        revoked = self.client.post(reverse("platform-sandbox-grant-revoke", args=[grant_id]))
        self.assertEqual(revoked.status_code, status.HTTP_200_OK)
        self.assertFalse(revoked.data["is_valid"])

    def test_duration_is_limited_and_executor_is_not_exposed(self):
        self.client.force_authenticate(self.developer)
        response = self.client.post(
            reverse("platform-sandbox-grant-list"),
            {"justification": "Teste de limite", "requested_minutes": 120},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(hasattr(DeveloperSandboxGrant, "command"))

    def test_executor_is_disabled_by_default(self):
        grant = DeveloperSandboxGrant.objects.create(
            requester=self.developer,
            approver=self.admin,
            justification="Diagnóstico aprovado",
            status=DeveloperSandboxGrant.Status.APPROVED,
            approved_at=timezone.now(),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.client.force_authenticate(self.developer)
        response = self.client.post(
            reverse("platform-sandbox-execute"), {"grant_id": grant.id, "code": "print(42)"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(SandboxExecution.objects.exists())
        status_response = self.client.get(reverse("platform-sandbox-status"))
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertFalse(status_response.data["enabled"])
        self.assertFalse(status_response.data["available"])
        self.assertEqual(str(status_response.data["active_grant"]["id"]), str(grant.id))

    @override_settings(
        SANDBOX_EXECUTOR_ENABLED=True,
        SANDBOX_EXECUTOR_TOKEN="0123456789abcdef0123456789abcdef",
    )
    @patch("apps.platform_admin.views.SandboxClient.execute")
    def test_valid_grant_calls_isolated_client_and_records_only_hash(self, execute):
        execute.return_value = {"status": "success", "exit_code": 0, "stdout": "42\n", "stderr": ""}
        grant = DeveloperSandboxGrant.objects.create(
            requester=self.developer,
            approver=self.admin,
            justification="Diagnóstico aprovado",
            status=DeveloperSandboxGrant.Status.APPROVED,
            approved_at=timezone.now(),
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.client.force_authenticate(self.developer)
        response = self.client.post(
            reverse("platform-sandbox-execute"), {"grant_id": grant.id, "code": "print(42)"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        execution = SandboxExecution.objects.get(pk=response.data["execution_id"])
        self.assertEqual(execution.status, SandboxExecution.Status.SUCCESS)
        self.assertEqual(execution.stdout_bytes, 3)
        self.assertFalse(hasattr(execution, "code"))

    @override_settings(
        SANDBOX_EXECUTOR_ENABLED=True,
        SANDBOX_EXECUTOR_TOKEN="0123456789abcdef0123456789abcdef",
    )
    @patch("apps.platform_admin.views.SandboxClient.health")
    def test_status_reports_healthy_external_executor(self, health):
        health.return_value = {"status": "healthy", "executor": "python-isolated"}
        self.client.force_authenticate(self.developer)
        response = self.client.get(reverse("platform-sandbox-status"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["enabled"])
        self.assertTrue(response.data["available"])
