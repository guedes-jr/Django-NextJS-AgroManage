from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile, SupportAccessGrant

User = get_user_model()


class SupportAccessAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente Suporte", slug="cliente-suporte")
        self.support = User.objects.create_user(
            email="support-access@platform.local", password="SupportPassword-8472",
            full_name="Support Agent",
        )
        PlatformStaffProfile.objects.create(user=self.support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=self.support)

    def test_support_token_reads_tenant_and_blocks_writes(self):
        response = self.client.post(
            reverse("platform-support-access-list"),
            {"organization_id": str(self.organization.id), "ticket_reference": "SUP-123", "justification": "Investigação do problema informado pelo cliente.", "duration_minutes": 15},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["grant"]["ticket_reference"], "SUP-123")
        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

        read_response = token_client.get(reverse("my-organization"))
        write_response = token_client.post(reverse("auth_logout"), {}, format="json")

        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertEqual(read_response.data["id"], str(self.organization.id))
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_revoked_grant_rejects_token(self):
        create_response = self.client.post(
            reverse("platform-support-access-list"),
            {"organization_id": str(self.organization.id), "ticket_reference": "SUP-456", "justification": "Validação técnica solicitada pelo cliente."},
            format="json",
        )
        grant = SupportAccessGrant.objects.get(pk=create_response.data["grant"]["id"])
        self.client.post(reverse("platform-support-access-revoke", args=[grant.id]))
        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_response.data['access']}")

        response = token_client.get(reverse("my-organization"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_operator_can_reopen_own_active_access(self):
        create_response = self.client.post(
            reverse("platform-support-access-list"),
            {
                "organization_id": str(self.organization.id),
                "ticket_reference": "SUP-789",
                "justification": "Continuidade da análise técnica do chamado.",
                "duration_minutes": 30,
            },
            format="json",
        )
        grant_id = create_response.data["grant"]["id"]

        response = self.client.post(
            reverse("platform-support-access-open-access", args=[grant_id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["grant"]["ticket_reference"], "SUP-789")

    def test_status_filter_separates_active_and_revoked_history(self):
        active = SupportAccessGrant.objects.create(
            operator=self.support,
            organization=self.organization,
            ticket_reference="SUP-ACTIVE",
            justification="Acesso ativo para investigação.",
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        revoked = SupportAccessGrant.objects.create(
            operator=self.support,
            organization=self.organization,
            ticket_reference="SUP-REVOKED",
            justification="Acesso revogado após conclusão.",
            expires_at=timezone.now() + timedelta(minutes=30),
            revoked_at=timezone.now(),
        )

        active_response = self.client.get(
            reverse("platform-support-access-list"), {"status": "active"}
        )
        revoked_response = self.client.get(
            reverse("platform-support-access-list"), {"status": "revoked"}
        )

        self.assertEqual(
            [item["id"] for item in active_response.data["results"]],
            [str(active.id)],
        )
        self.assertEqual(
            [item["id"] for item in revoked_response.data["results"]],
            [str(revoked.id)],
        )
