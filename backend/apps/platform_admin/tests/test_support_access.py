from django.contrib.auth import get_user_model
from django.urls import reverse
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
            {"organization_id": str(self.organization.id), "justification": "Investigação do chamado SUP-123", "duration_minutes": 15},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
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
            {"organization_id": str(self.organization.id), "justification": "Validação do chamado SUP-456"},
            format="json",
        )
        grant = SupportAccessGrant.objects.get(pk=create_response.data["grant"]["id"])
        self.client.post(reverse("platform-support-access-revoke", args=[grant.id]))
        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Bearer {create_response.data['access']}")

        response = token_client.get(reverse("my-organization"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
