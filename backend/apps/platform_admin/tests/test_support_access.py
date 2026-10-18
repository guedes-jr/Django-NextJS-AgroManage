from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile, SupportAccessGrant

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

    def create_access(self):
        response = self.client.post(
            reverse("platform-support-access-list"),
            {"organization_id": str(self.organization.id)}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response, client

    def test_support_access_needs_only_organization_and_records_history(self):
        response, client = self.create_access()
        grant = SupportAccessGrant.objects.get(pk=response.data["grant"]["id"])
        self.assertEqual(grant.operator, self.support)
        self.assertEqual(grant.organization, self.organization)
        self.assertEqual(grant.justification, "")
        self.assertTrue(PlatformAuditLog.objects.filter(action="support_access.created", organization=self.organization).exists())
        read = client.get(reverse("my-organization"))
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        self.assertEqual(read.data["id"], str(self.organization.id))

    def test_support_can_create_update_and_delete_in_selected_organization(self):
        _, client = self.create_access()
        response = client.post(reverse("farms-list"), {"name": "Fazenda Suporte"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        farm = Farm.objects.get(pk=response.data["id"])
        self.assertEqual(farm.organization, self.organization)
        detail = reverse("farms-detail", args=[farm.pk])
        self.assertEqual(client.patch(detail, {"name": "Atualizada"}, format="json").status_code, status.HTTP_200_OK)
        farm.refresh_from_db()
        self.assertEqual(farm.name, "Atualizada")
        self.assertEqual(client.delete(detail).status_code, status.HTTP_204_NO_CONTENT)
        self.support.refresh_from_db()
        self.assertIsNone(self.support.organization_id)
        self.assertNotEqual(self.support.role, "admin")

    def test_profile_save_does_not_persist_support_role_or_organization(self):
        from common.authentication import ActiveOrganizationJWTAuthentication
        from rest_framework_simplejwt.tokens import AccessToken

        response, _ = self.create_access()
        user = ActiveOrganizationJWTAuthentication().get_user(AccessToken(response.data["access"]))
        user.full_name = "Support Updated"
        user.save()
        self.assertEqual(user.role, "admin")
        self.assertEqual(user.organization, self.organization)
        self.support.refresh_from_db()
        self.assertEqual(self.support.full_name, "Support Updated")
        self.assertEqual(self.support.role, User.Role.OPERATOR)
        self.assertIsNone(self.support.organization_id)

    def test_support_cannot_change_other_organization(self):
        other = Organization.objects.create(name="Outra", slug="outra")
        farm = Farm.objects.create(name="Fazenda Outra", organization=other)
        _, client = self.create_access()
        detail = reverse("farms-detail", args=[farm.pk])
        for response in (client.get(detail), client.patch(detail, {"name": "Inválida"}, format="json"), client.delete(detail)):
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        farm.refresh_from_db()
        self.assertEqual(farm.name, "Fazenda Outra")

    def test_disabled_staff_and_changed_role_reject_support_token(self):
        _, client = self.create_access()
        profile = self.support.platform_staff_profile
        profile.is_active = False
        profile.save()
        self.assertEqual(client.get(reverse("my-organization")).status_code, status.HTTP_401_UNAUTHORIZED)
        profile.is_active = True
        profile.role = PlatformStaffProfile.Role.AUDITOR
        profile.save()
        self.assertEqual(client.get(reverse("my-organization")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_access_and_suspended_organization_reject_token(self):
        response, client = self.create_access()
        self.organization.is_active = False
        self.organization.save()
        self.assertEqual(client.get(reverse("my-organization")).status_code, status.HTTP_401_UNAUTHORIZED)
        self.organization.is_active = True
        self.organization.save()
        SupportAccessGrant.objects.filter(pk=response.data["grant"]["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(client.get(reverse("my-organization")).status_code, status.HTTP_401_UNAUTHORIZED)

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
