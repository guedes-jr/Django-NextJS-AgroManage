from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformAccessAPITestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Organização A", slug="org-a")
        self.org_b = Organization.objects.create(name="Organização B", slug="org-b")
        self.customer_owner = User.objects.create_user(
            email="owner@example.com",
            password="password123",
            full_name="Cliente Owner",
            role=User.Role.OWNER,
            organization=self.org_a,
        )
        self.platform_admin = User.objects.create_user(
            email="platform@example.com",
            password="password123",
            full_name="Platform Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.platform_admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )

    def test_customer_owner_cannot_access_platform_dashboard(self):
        self.client.force_authenticate(user=self.customer_owner)

        response = self.client.get(reverse("platform-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_is_staff_without_platform_profile_cannot_access_dashboard(self):
        staff_user = User.objects.create_user(
            email="staff@example.com",
            password="password123",
            full_name="Django Staff",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.client.get(reverse("platform-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_admin_can_access_global_dashboard(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.get(reverse("platform-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["organizations"]["total"], 2)
        self.assertEqual(response.data["organizations"]["active"], 2)

    def test_platform_admin_can_read_own_platform_identity(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.get(reverse("platform-me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.platform_admin.email)
        self.assertEqual(response.data["role"], PlatformStaffProfile.Role.ADMIN)

    def test_platform_admin_can_list_all_organizations(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.get(reverse("platform-organization-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_customer_owner_cannot_list_organizations(self):
        self.client.force_authenticate(user=self.customer_owner)

        response = self.client.get(reverse("platform-organization-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_admin_can_suspend_and_audit_organization(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(
            reverse("platform-organization-suspend", args=[self.org_b.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.org_b.refresh_from_db()
        self.assertFalse(self.org_b.is_active)
        audit_log = PlatformAuditLog.objects.get(action="organization.suspended")
        self.assertEqual(audit_log.actor, self.platform_admin)
        self.assertEqual(audit_log.organization, self.org_b)

    def test_user_cannot_login_when_organization_is_suspended(self):
        self.org_a.is_active = False
        self.org_a.save(update_fields=["is_active", "updated_at"])

        response = self.client.post(
            reverse("auth_login"),
            {"email": self.customer_owner.email, "password": "password123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Organização suspensa", str(response.data))

    def test_support_can_read_but_cannot_suspend(self):
        support = User.objects.create_user(
            email="support@example.com",
            password="password123",
            full_name="Platform Support",
        )
        PlatformStaffProfile.objects.create(
            user=support,
            role=PlatformStaffProfile.Role.SUPPORT,
        )
        self.client.force_authenticate(user=support)

        list_response = self.client.get(reverse("platform-organization-list"))
        suspend_response = self.client.post(
            reverse("platform-organization-suspend", args=[self.org_b.id])
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(suspend_response.status_code, status.HTTP_403_FORBIDDEN)
