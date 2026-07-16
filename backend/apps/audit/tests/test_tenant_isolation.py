from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.organizations.models import Organization

User = get_user_model()


class AuditTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Auditoria A", slug="audit-a-isolation")
        self.org_b = Organization.objects.create(name="Auditoria B", slug="audit-b-isolation")
        self.user_a = User.objects.create_user(
            email="audit-a@example.com", password="Password-8472", full_name="Auditoria A", organization=self.org_a
        )
        self.user_b = User.objects.create_user(
            email="audit-b@example.com", password="Password-8472", full_name="Auditoria B", organization=self.org_b
        )
        self.log_a = AuditLog.objects.create(
            organization=self.org_a, user=self.user_a, action=AuditLog.Action.CREATE, description="Log A"
        )
        self.log_b = AuditLog.objects.create(
            organization=self.org_b, user=self.user_b, action=AuditLog.Action.CREATE, description="Log B"
        )
        self.client.force_authenticate(self.user_a)

    def test_list_and_detail_hide_foreign_logs(self):
        response = self.client.get(reverse("audit-log-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {str(item["id"]) for item in response.data["results"]}
        self.assertIn(str(self.log_a.id), ids)
        self.assertNotIn(str(self.log_b.id), ids)
        detail = self.client.get(reverse("audit-log-detail", args=[self.log_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_audit_api_is_read_only(self):
        create = self.client.post(reverse("audit-log-list"), {"description": "Tentativa"}, format="json")
        delete = self.client.delete(reverse("audit-log-detail", args=[self.log_a.id]))
        self.assertEqual(create.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(delete.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
