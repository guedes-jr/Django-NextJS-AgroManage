from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

User = get_user_model()


class OrganizationLanguageSettingsTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Fazenda A", slug="fazenda-a")
        self.other_organization = Organization.objects.create(name="Fazenda B", slug="fazenda-b")
        self.admin = User.objects.create_user(
            email="admin@language.test",
            password="password123",
            organization=self.organization,
            role="admin",
        )
        self.operator = User.objects.create_user(
            email="operator@language.test",
            password="password123",
            organization=self.organization,
            role="operator",
        )

    def test_language_is_saved_only_for_the_current_organization(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("my-organization"),
            {"language": Organization.Language.ENGLISH},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.organization.refresh_from_db()
        self.other_organization.refresh_from_db()
        self.assertEqual(self.organization.language, Organization.Language.ENGLISH)
        self.assertEqual(self.other_organization.language, Organization.Language.PORTUGUESE_BRAZIL)
        self.assertEqual(response.data["language"], Organization.Language.ENGLISH)

    def test_invalid_language_is_rejected(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("my-organization"),
            {"language": "fr"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.language, Organization.Language.PORTUGUESE_BRAZIL)

    def test_operator_can_read_organization_language_but_cannot_change_it(self):
        self.organization.language = Organization.Language.SPANISH
        self.organization.save(update_fields={"language"})
        self.client.force_authenticate(self.operator)

        response = self.client.get(reverse("my-organization"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["language"], Organization.Language.SPANISH)

        response = self.client.patch(
            reverse("my-organization"),
            {"language": Organization.Language.ENGLISH},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.language, Organization.Language.SPANISH)
