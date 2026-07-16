from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.tokens import issue_tokens_for_user
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformUserManagementAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente", slug="cliente-users")
        self.customer = User.objects.create_user(
            email="user@cliente.com",
            password="CustomerPassword-8472",
            full_name="Usuário Cliente",
            role=User.Role.MANAGER,
            organization=self.organization,
        )
        self.platform_admin = User.objects.create_user(
            email="admin@platform.local",
            password="PlatformPassword-8472",
            full_name="Platform Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.platform_admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )

    def test_platform_admin_lists_customer_users_but_not_internal_staff(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.get(reverse("platform-user-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["email"], self.customer.email)

    def test_customer_owner_cannot_list_global_users(self):
        self.customer.role = User.Role.OWNER
        self.customer.save(update_fields=["role", "updated_at"])
        self.client.force_authenticate(user=self.customer)

        response = self.client.get(reverse("platform-user-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_admin_blocks_user_and_records_audit(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(reverse("platform-user-block", args=[self.customer.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        self.assertEqual(self.customer.session_version, 1)
        audit = PlatformAuditLog.objects.get(action="user.blocked")
        self.assertEqual(audit.object_id, str(self.customer.id))

    def test_revoked_access_token_is_rejected_immediately(self):
        refresh = issue_tokens_for_user(self.customer)
        access = str(refresh.access_token)
        self.client.force_authenticate(user=self.platform_admin)
        revoke_response = self.client.post(
            reverse("platform-user-revoke-sessions", args=[self.customer.id])
        )
        self.assertEqual(revoke_response.status_code, status.HTTP_200_OK)

        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = token_client.get(reverse("auth_me"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_support_can_read_but_cannot_block_user(self):
        support = User.objects.create_user(
            email="support@platform.local",
            password="SupportPassword-8472",
            full_name="Platform Support",
        )
        PlatformStaffProfile.objects.create(
            user=support,
            role=PlatformStaffProfile.Role.SUPPORT,
        )
        self.client.force_authenticate(user=support)

        list_response = self.client.get(reverse("platform-user-list"))
        block_response = self.client.post(
            reverse("platform-user-block", args=[self.customer.id])
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(block_response.status_code, status.HTTP_403_FORBIDDEN)
