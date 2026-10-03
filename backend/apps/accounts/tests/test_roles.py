from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from common.permissions import OrganizationRolePermission

User = get_user_model()


class RolePermissionMatrixTests(APITestCase):
    def test_every_role_follows_the_operation_matrix(self):
        permission = OrganizationRolePermission()
        for role in ["owner", "admin", "manager", "operator", "viewer"]:
            user = SimpleNamespace(role=role, is_active=True, is_authenticated=True, organization_id="org")
            for method in ["GET", "POST", "PATCH", "PUT", "DELETE"]:
                expected = method == "GET" or (role != "viewer" and method == "POST") or role in {"owner", "admin", "manager"}
                view = SimpleNamespace(write_roles={"owner", "admin", "manager", "operator"})
                request = SimpleNamespace(user=user, method=method)
                with self.subTest(role=role, method=method):
                    self.assertEqual(permission.has_permission(request, view), expected)
                    self.assertEqual(permission.has_object_permission(request, view, object()), expected)

    def test_post_cannot_bypass_edit_or_delete_restrictions(self):
        permission = OrganizationRolePermission()
        for role in ["operator", "manager"]:
            request = SimpleNamespace(user=SimpleNamespace(role=role, is_active=True, is_authenticated=True, organization_id="org"), method="POST")
            for action, operation in [("bulk_delete", "delete"), ("upload_imagem", "edit"), ("merge_batches", "edit")]:
                view = SimpleNamespace(action=action, action_operations={action: operation})
                self.assertEqual(permission.has_permission(request, view), role == "manager")

    def test_inactive_or_unbound_users_cannot_access_tenant_records(self):
        permission = OrganizationRolePermission()
        for active, organization in [(False, "org"), (True, None)]:
            request = SimpleNamespace(user=SimpleNamespace(role="owner", is_active=active, is_authenticated=True, organization_id=organization), method="GET")
            self.assertFalse(permission.has_permission(request, SimpleNamespace()))


class MemberRoleTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Cargos", slug="roles")
        self.other = Organization.objects.create(name="Outra", slug="other-roles")
        self.owner = self.user("owner", "owner")
        self.admin = self.user("admin", "admin")
        self.operator = self.user("operator", "operator")
        self.client.force_authenticate(self.owner)

    def user(self, name, role, organization=None):
        return User.objects.create_user(email=f"{name}@example.com", password="test12345", full_name=name, role=role, organization=organization or self.org)

    def patch(self, user, **changes):
        return self.client.patch(reverse("auth_member_detail", args=[user.pk]), changes, format="json")

    def test_owner_changes_role_and_receives_portuguese_label(self):
        response = self.patch(self.operator, role="manager")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role_display"], "Gerente")
        self.operator.refresh_from_db()
        self.assertEqual(self.operator.role, "manager")
        response = self.client.get(reverse("auth_members"))
        self.assertEqual({member["role_display"] for member in response.data}, {"Proprietário", "Administrador", "Gerente"})

    def test_admin_can_save_profile_with_unchanged_role_and_change_lower_roles(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.patch(self.admin, role="admin", full_name="Administrador atualizado").status_code, 200)
        self.assertEqual(self.patch(self.operator, role="viewer").status_code, 200)
        self.assertEqual(self.patch(self.operator, role="admin").status_code, 403)
        self.assertEqual(self.patch(self.owner, role="operator").status_code, 403)

    def test_lower_roles_cannot_manage_users_or_promote_themselves(self):
        for role in ["manager", "operator", "viewer"]:
            user = self.user(role+"-other", role)
            self.client.force_authenticate(user)
            self.assertEqual(self.patch(user, role="owner").status_code, 403)
            self.assertEqual(self.patch(self.operator, role="manager").status_code, 403)
            response = self.client.post(reverse("auth_members_create"), {}, format="json")
            self.assertEqual(response.status_code, 403)

    def test_self_demotion_deactivation_removal_and_foreign_member_changes_are_blocked(self):
        self.assertEqual(self.patch(self.owner, role="operator").status_code, 400)
        self.assertEqual(self.patch(self.owner, is_active=False).status_code, 400)
        self.assertEqual(self.patch(self.owner, is_active="false").status_code, 400)
        self.assertEqual(self.client.delete(reverse("auth_member_detail", args=[self.owner.pk])).status_code, 400)
        foreign = self.user("foreign", "operator", self.other)
        self.assertEqual(self.patch(foreign, role="manager").status_code, 404)

    def test_admin_cannot_create_owner_or_admin(self):
        self.client.force_authenticate(self.admin)
        for role in ["owner", "admin"]:
            response = self.client.post(reverse("auth_members_create"), {"email": f"new-{role}@example.com", "full_name": "Novo", "role": role, "password": "test12345", "password_confirm": "test12345"}, format="json")
            self.assertEqual(response.status_code, 403)
