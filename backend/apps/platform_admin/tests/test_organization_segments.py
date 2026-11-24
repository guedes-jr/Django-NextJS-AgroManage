from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import PlanSegment, PlanTier
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile
from apps.veterinary.access import veterinary_enabled

User = get_user_model()


class OrganizationSegmentsAPITestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente Vet", slug="cliente-vet")
        self.admin = User.objects.create_user(email="admin@platform.local", password="PlatformPassword-8472", full_name="Admin", is_staff=True)
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.url = reverse("platform-organization-dossier-segments", args=[self.organization.id])
        segment, _ = PlanSegment.objects.get_or_create(code="area-veterinario", defaults={"name": "Área do veterinário", "subtitle": "Clínica", "description": "Vet"})
        if not segment.tiers.filter(is_active=True).exists():
            PlanTier.objects.create(segment=segment, label="Sob consulta", requires_quote=True)
        self.client.force_authenticate(user=self.admin)

    def test_contract_veterinary_segment_grants_access_and_audits(self):
        self.assertFalse(veterinary_enabled(self.organization))
        response = self.client.post(self.url, {"segment_code": "area-veterinario", "contracted": True, "final_monthly_price": "150.00"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(veterinary_enabled(self.organization))
        vet = next(row for row in response.data["segments"] if row["code"] == "area-veterinario")
        self.assertTrue(vet["contracted"])
        self.assertEqual(vet["item"]["final_monthly_price"], "150.00")
        self.assertTrue(PlatformAuditLog.objects.filter(action="subscription.segment_added", organization=self.organization).exists())

    def test_support_can_read_but_not_change_segments(self):
        support = User.objects.create_user(email="support@platform.local", password="SupportPassword-8472", full_name="Suporte")
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=support)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_200_OK)
        response = self.client.post(self.url, {"segment_code": "area-veterinario", "contracted": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
