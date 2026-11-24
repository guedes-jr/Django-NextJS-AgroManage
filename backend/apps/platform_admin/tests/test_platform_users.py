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
        self.customer.role = User.Role.ADMIN
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


class PlatformUserEditingAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente", slug="cliente-edit")
        self.admin = User.objects.create_user(
            email="dono@cliente.com", password="CustomerPassword-8472", full_name="Dono",
            role=User.Role.ADMIN, organization=self.organization, organization_responsible=True,
        )
        self.customer = User.objects.create_user(
            email="user@cliente.com", password="CustomerPassword-8472", full_name="Usuário Cliente",
            role=User.Role.MANAGER, organization=self.organization,
        )
        self.platform_admin = User.objects.create_user(
            email="admin@platform.local", password="PlatformPassword-8472", full_name="Platform Admin", is_staff=True,
        )
        PlatformStaffProfile.objects.create(user=self.platform_admin, role=PlatformStaffProfile.Role.ADMIN)
        self.client.force_authenticate(user=self.platform_admin)

    def url(self, user, name="platform-user-detail"):
        return reverse(name, args=[user.id])

    def test_platform_admin_updates_profile_and_records_audit(self):
        response = self.client.patch(self.url(self.customer), {
            "full_name": "Nome Corrigido", "email": "Novo@Cliente.com", "phone": "11999990000",
            "phone_is_whatsapp": True, "role": User.Role.OPERATOR, "operator_read_only": True,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.full_name, "Nome Corrigido")
        self.assertEqual(self.customer.email, "novo@cliente.com")
        self.assertEqual(self.customer.role, User.Role.OPERATOR)
        self.assertTrue(self.customer.operator_read_only)
        self.assertEqual(self.customer.session_version, 1)
        audit = PlatformAuditLog.objects.get(action="user.updated")
        self.assertEqual(audit.extra_data["before"]["email"], "user@cliente.com")
        self.assertNotIn("password", audit.extra_data["after"])

    def test_rejects_duplicate_email(self):
        response = self.client.patch(self.url(self.customer), {"email": "DONO@cliente.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data["error"]["detail"])

    def test_responsible_must_remain_admin(self):
        response = self.client.patch(self.url(self.admin), {"role": User.Role.MANAGER}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)

    def test_scope_flags_are_cleared_for_non_operator_roles(self):
        self.customer.role = User.Role.OPERATOR
        self.customer.can_operate_crops = True
        self.customer.save()
        response = self.client.patch(self.url(self.customer), {"role": User.Role.MANAGER}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.can_operate_crops)

    def test_platform_admin_sets_password_and_revokes_sessions(self):
        response = self.client.post(self.url(self.customer, "platform-user-set-password"), {
            "new_password": "NovaSenhaSegura-9921", "new_password_confirm": "NovaSenhaSegura-9921",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("NovaSenhaSegura-9921"))
        self.assertTrue(self.customer.force_password_change)
        self.assertEqual(self.customer.session_version, 1)
        audit = PlatformAuditLog.objects.get(action="user.password_reset")
        self.assertNotIn("NovaSenhaSegura-9921", str(audit.extra_data))

    def test_password_confirmation_must_match(self):
        response = self.client.post(self.url(self.customer, "platform-user-set-password"), {
            "new_password": "NovaSenhaSegura-9921", "new_password_confirm": "Outra-9921xx",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_support_cannot_edit_or_set_password(self):
        support = User.objects.create_user(email="support@platform.local", password="SupportPassword-8472", full_name="Suporte")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=support)
        self.assertEqual(self.client.patch(self.url(self.customer), {"full_name": "X"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(self.url(self.customer, "platform-user-set-password"), {}, format="json").status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_edit_internal_staff_through_customer_directory(self):
        response = self.client.patch(self.url(self.platform_admin), {"full_name": "X"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
