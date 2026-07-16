import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile, SqlQueryExecution


@pytest.mark.django_db
class TestApprovedQueries:
    def setup_method(self):
        self.organization = Organization.objects.create(name="Fazenda Teste", slug="fazenda-teste")
        self.developer = User.objects.create_user(email="dev@example.com", password="secret", full_name="Dev")
        PlatformStaffProfile.objects.create(user=self.developer, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client = APIClient()
        self.client.force_authenticate(self.developer)
        self.url = reverse("platform-approved-queries")

    def test_lists_catalog_and_executes_masked_organization_users(self):
        User.objects.create_user(
            email="producer@example.com", password="secret", full_name="Produtor", organization=self.organization
        )

        catalog = self.client.get(self.url)
        assert catalog.status_code == 200
        assert any(item["key"] == "organization_users" for item in catalog.data["results"])

        response = self.client.post(
            self.url,
            {"key": "organization_users", "organization_id": self.organization.id},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["rows"][0][2] == "pr***@example.com"
        assert SqlQueryExecution.objects.filter(query_text="approved:organization_users").exists()

    def test_rejects_unknown_query_and_missing_required_parameter(self):
        assert self.client.post(self.url, {"key": "unknown"}, format="json").status_code == 400
        assert self.client.post(self.url, {"key": "organization_users"}, format="json").status_code == 400

    def test_support_cannot_use_catalog(self):
        support = User.objects.create_user(email="support@example.com", password="secret", full_name="Support")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(support)
        assert self.client.get(self.url).status_code == 403
