from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class UpdateProjectAPITestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", slug="test-org")
        self.owner = User.objects.create_user(
            email="owner@test.com",
            password="password123",
            full_name="Org Owner",
            role=User.Role.OWNER,
            organization=self.org
        )
        self.admin = User.objects.create_user(
            email="admin@test.com",
            password="password123",
            full_name="Org Admin",
            role=User.Role.ADMIN,
            organization=self.org
        )
        self.operator = User.objects.create_user(
            email="operator@test.com",
            password="password123",
            full_name="Org Operator",
            role=User.Role.OPERATOR,
            organization=self.org
        )
        self.url = reverse("update-project")
        self.platform_admin = User.objects.create_user(
            email="platform@test.com",
            password="password123",
            full_name="Platform Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.platform_admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )

    def test_anonymous_user_cannot_update_project(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_operator_cannot_update_project(self):
        self.client.force_authenticate(user=self.operator)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_cannot_update_project(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_admin_cannot_update_project(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_view_logs(self):
        response = self.client.get(reverse("update-logs"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_operator_cannot_view_logs(self):
        self.client.force_authenticate(user=self.operator)
        response = self.client.get(reverse("update-logs"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_cannot_view_logs(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse("update-logs"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_admin_cannot_view_logs(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("update-logs"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_admin_can_view_logs(self):
        self.client.force_authenticate(user=self.platform_admin)
        response = self.client.get(reverse("update-logs"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)
        self.assertIn("progress", response.data)
        self.assertIn("logs", response.data)
