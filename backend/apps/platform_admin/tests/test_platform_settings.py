from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.tokens import issue_tokens_for_user
from apps.organizations.models import Organization
from apps.platform_admin.models import FeatureFlag, MaintenanceWindow, PlatformStaffProfile, SystemAnnouncement

User = get_user_model()


class PlatformSettingsAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Config Cliente", slug="config-cliente")
        self.customer = User.objects.create_user(email="config@cliente.com", password="CustomerPassword-8472", full_name="Cliente", organization=self.organization)
        self.admin = User.objects.create_user(email="config@platform.local", password="AdminPassword-8472", full_name="Admin")
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)

    def test_client_state_returns_active_announcement_and_flag(self):
        SystemAnnouncement.objects.create(title="Aviso", message="Mensagem", starts_at=timezone.now())
        FeatureFlag.objects.create(key="new-dashboard", name="Novo dashboard", is_enabled=True)
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(reverse("platform-client-state"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["announcements"]), 1)
        self.assertTrue(response.data["feature_flags"]["new-dashboard"])

    def test_active_maintenance_rejects_tenant_token_but_not_platform(self):
        MaintenanceWindow.objects.create(title="Manutenção", message="Voltamos em breve", is_active=True, starts_at=timezone.now() - timedelta(minutes=1))
        customer_client = APIClient()
        customer_client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens_for_user(self.customer).access_token}")
        self.assertEqual(customer_client.get(reverse("my-organization")).status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get(reverse("platform-dashboard")).status_code, status.HTTP_200_OK)
