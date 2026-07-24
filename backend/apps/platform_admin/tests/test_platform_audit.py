from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformAuditCenterAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente Auditável", slug="cliente-auditavel")
        self.auditor = User.objects.create_user(
            email="auditor@platform.test",
            password="AuditorPassword-8472",
            full_name="Platform Auditor",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(user=self.auditor, role=PlatformStaffProfile.Role.AUDITOR)
        self.support = User.objects.create_user(
            email="support-audit@platform.test",
            password="SupportPassword-8472",
            full_name="Platform Support",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(user=self.support, role=PlatformStaffProfile.Role.SUPPORT)
        self.log = PlatformAuditLog.objects.create(
            actor=self.auditor,
            organization=self.organization,
            action="organization.updated",
            object_type="Organization",
            object_id=str(self.organization.id),
            description="Cadastro atualizado.",
            ip_address="192.0.2.10",
            request_id="req-audit-001",
            extra_data={"field": "email"},
        )

    def test_auditor_lists_and_reads_log_details(self):
        self.client.force_authenticate(user=self.auditor)

        list_response = self.client.get(reverse("platform-audit-log-list"))
        detail_response = self.client.get(reverse("platform-audit-log-detail", args=[self.log.id]))

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["request_id"], "req-audit-001")
        self.assertEqual(detail_response.data["extra_data"], {"field": "email"})

    def test_support_cannot_access_platform_audit(self):
        self.client.force_authenticate(user=self.support)

        response = self.client.get(reverse("platform-audit-log-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_audit_api_is_immutable(self):
        self.client.force_authenticate(user=self.auditor)

        create = self.client.post(reverse("platform-audit-log-list"), {"action": "forged"}, format="json")
        delete = self.client.delete(reverse("platform-audit-log-detail", args=[self.log.id]))

        self.assertEqual(create.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(delete.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(PlatformAuditLog.objects.filter(pk=self.log.id).exists())

    def test_filters_by_action_organization_and_period(self):
        old_log = PlatformAuditLog.objects.create(
            actor=self.auditor,
            action="old.action",
            description="Registro antigo",
        )
        PlatformAuditLog.objects.filter(pk=old_log.pk).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        self.client.force_authenticate(user=self.auditor)

        response = self.client.get(
            reverse("platform-audit-log-list"),
            {
                "action": "organization.updated",
                "organization": str(self.organization.id),
                "created_after": timezone.localdate().isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.log.id))

    def test_export_generates_csv_and_audits_download(self):
        self.log.description = "=DANGEROUS()"
        self.log.save(update_fields=("description", "updated_at"))
        self.client.force_authenticate(user=self.auditor)

        response = self.client.get(reverse("platform-audit-log-export"))
        content = response.content.decode("utf-8-sig")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("organization.updated", content)
        self.assertNotIn(",=DANGEROUS()", content)
        self.assertTrue(PlatformAuditLog.objects.filter(action="audit.exported").exists())
