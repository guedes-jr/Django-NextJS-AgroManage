from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import DemoRequest, PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class DemoRequestAPITestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="demo-admin@platform.local",
            password="DemoAdminPassword-8472",
            full_name="Demo Admin",
        )
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.payload = {
            "name": "Cliente Potencial",
            "email": "cliente@example.com",
            "phone": "85999999999",
            "organization_name": "Fazenda Exemplo",
            "operation_profile": "Operação mista",
            "message": "Quero organizar estoque, produção e financeiro.",
        }

    def test_anonymous_visitor_creates_pending_request(self):
        response = self.client.post(reverse("public-demo-request"), self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request = DemoRequest.objects.get(email=self.payload["email"])
        self.assertEqual(request.status, DemoRequest.Status.PENDING)
        self.assertNotIn("ip_address", response.data)

    def test_platform_admin_approves_and_audits_request(self):
        demo_request = DemoRequest.objects.create(**self.payload)
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("platform-demo-request-approve", args=[demo_request.id]),
            {"notes": "Perfil aderente ao plano Pro."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.APPROVED)
        self.assertEqual(demo_request.decided_by, self.admin)
        self.assertTrue(PlatformAuditLog.objects.filter(action="demo_request.approved").exists())

    def test_decided_request_cannot_be_decided_again(self):
        demo_request = DemoRequest.objects.create(
            **self.payload,
            status=DemoRequest.Status.REJECTED,
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("platform-demo-request-approve", args=[demo_request.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
