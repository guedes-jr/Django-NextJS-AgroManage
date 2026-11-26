from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import Invoice, Payment
from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class OrganizationDeletionTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Excluir", slug="excluir-org")
        self.member = User.objects.create_user(email="m@excluir.local", password="Member-8472x", full_name="M", organization=self.organization, role="admin")
        Farm.objects.create(organization=self.organization, name="Fazenda")
        self.owner = User.objects.create_user(email="owner@platform.local", password="Owner-8472x", full_name="Owner", is_staff=True)
        PlatformStaffProfile.objects.create(user=self.owner, role=PlatformStaffProfile.Role.OWNER)
        self.admin = User.objects.create_user(email="adm@platform.local", password="Admin-8472x", full_name="Adm", is_staff=True)
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.url = reverse("platform-organization-permanent-deletion", args=[self.organization.id])

    def archive(self):
        self.organization.status = Organization.Status.ARCHIVED
        self.organization.save(update_fields=["status"])

    def test_requires_archive_owner_and_typed_slug(self):
        self.client.force_authenticate(self.owner)
        self.assertFalse(self.client.get(self.url).data["can_delete"])
        self.assertEqual(self.client.post(self.url, {"confirmation": "excluir-org", "reason": "x"}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.archive()
        self.assertEqual(self.client.post(self.url, {"confirmation": "errado", "reason": "x"}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.url, {"confirmation": "excluir-org", "reason": "x"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Organization.objects.filter(pk=self.organization.pk).exists())

    def test_owner_deletes_tenant_data_and_customer_accounts_keeping_audit(self):
        self.archive()
        Invoice.objects.create(number="DEL-1", organization=self.organization, subscription=self.organization.subscription, subtotal=10, total=10, due_date=timezone.localdate())
        self.client.force_authenticate(self.owner)
        response = self.client.post(self.url, {"confirmation": "excluir-org", "reason": "Cadastro de teste"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(Organization.objects.filter(pk=self.organization.pk).exists())
        self.assertFalse(User.objects.filter(pk=self.member.pk).exists())
        self.assertFalse(Farm.objects.filter(name="Fazenda").exists())
        self.assertTrue(User.objects.filter(pk=self.owner.pk).exists())
        audit = PlatformAuditLog.objects.get(action="organization.deleted")
        self.assertEqual(audit.extra_data["slug"], "excluir-org")
        self.assertEqual(audit.extra_data["reason"], "Cadastro de teste")

    def test_financial_history_blocks_deletion(self):
        self.archive()
        invoice = Invoice.objects.create(number="DEL-2", organization=self.organization, subscription=self.organization.subscription, subtotal=10, total=10, due_date=timezone.localdate())
        Payment.objects.create(invoice=invoice, organization=self.organization, amount=Decimal("10"), status=Payment.Status.SUCCEEDED, paid_at=timezone.now())
        self.client.force_authenticate(self.owner)
        response = self.client.post(self.url, {"confirmation": "excluir-org", "reason": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Organization.objects.filter(pk=self.organization.pk).exists())
