from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.billing.services import create_manual_invoice, record_manual_payment
from apps.organizations.models import Organization, OrganizationAddress, OrganizationContact
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile, SupportAccessGrant

User = get_user_model()
SECTIONS = ("registration", "users", "subscription", "invoices", "payments", "history", "support-access")


class OrganizationDossierTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Cliente Alfa", slug="dossier-alfa")
        self.other = Organization.objects.create(name="Cliente Beta", slug="dossier-beta")
        self.admin = self.staff("platform_admin", "Admin Dossier")
        self.owner = User.objects.create_user(email="maria@alfa.test", full_name="Maria Produtora", organization=self.organization, role="admin", organization_responsible=True)
        self.foreign = User.objects.create_user(email="foreign@beta.test", organization=self.other, role="admin")
        self.invoice = self.make_invoice(self.organization)
        self.foreign_invoice = self.make_invoice(self.other)
        self.payment = record_manual_payment(invoice=self.invoice, amount=Decimal("20"))
        record_manual_payment(invoice=self.foreign_invoice, amount=Decimal("20"))
        self.log = PlatformAuditLog.objects.create(organization=self.organization, actor=self.admin, action="organization.updated", description="Ajuste exclusivo Alfa")
        PlatformAuditLog.objects.create(organization=self.other, actor=self.admin, action="organization.updated", description="Registro Beta")
        self.grant = self.make_grant(self.organization, self.admin)
        self.make_grant(self.other, self.admin)
        self.client.force_authenticate(self.admin)

    def staff(self, role, name=None):
        user = User.objects.create_user(email=f"{role}@dossier.test", full_name=name or role)
        PlatformStaffProfile.objects.create(user=user, role=role)
        return user

    def make_invoice(self, organization):
        return create_manual_invoice(organization=organization, due_date=timezone.localdate() + timedelta(days=5), description="Assinatura", amount=Decimal("100"))

    def make_grant(self, organization, operator):
        return SupportAccessGrant.objects.create(organization=organization, operator=operator, justification="", expires_at=timezone.now() + timedelta(minutes=30))

    def url(self, section, organization_id=None):
        return reverse(f"platform-organization-dossier-{section}", args=[organization_id or self.organization.pk])

    def test_detail_exposes_capabilities_without_loading_section_records(self):
        response = self.client.get(reverse("platform-organization-detail", args=[self.organization.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["can_manage"])
        self.assertEqual(set(response.data["available_sections"]), {"summary", "consumption", "adoption", "operation", "tickets", "exports", "recovery", *SECTIONS})
        self.assertEqual(response.data["responsible"]["id"], str(self.owner.pk))
        for field in ("payments", "invoices", "users", "history", "contacts", "addresses"):
            self.assertNotIn(field, response.data)

    def test_each_list_is_scoped_by_url_even_with_conflicting_query_parameters(self):
        expected = {"users": self.owner.pk, "invoices": self.invoice.pk, "payments": self.payment.pk, "history": self.log.pk, "support-access": self.grant.pk}
        for section, record_id in expected.items():
            with self.subTest(section=section):
                response = self.client.get(self.url(section), {"organization": str(self.other.pk)})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual([row["id"] for row in response.data["results"]], [str(record_id)])
                self.assertEqual(response.data["count"], 1)

    def test_registration_and_subscription_belong_to_selected_organization(self):
        address = OrganizationAddress.objects.create(organization=self.organization, street="Rua Alfa", city="Fortaleza", state="CE")
        OrganizationAddress.objects.create(organization=self.other, street="Rua Beta", city="Recife", state="PE")
        contact = OrganizationContact.objects.create(organization=self.organization, name="Maria", value="maria@alfa.test", contact_type="email")
        response = self.client.get(self.url("registration"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], str(self.organization.pk))
        self.assertEqual([row["id"] for row in response.data["addresses"]], [str(address.pk)])
        self.assertEqual([row["id"] for row in response.data["contacts"]], [str(contact.pk)])
        subscription = self.client.get(self.url("subscription"), {"organization": str(self.other.pk)})
        self.assertEqual(subscription.data["subscription"]["organization"], self.organization.pk)

    def test_search_and_pagination_apply_to_child_records(self):
        matches = {"users": "Maria Produtora", "invoices": self.invoice.number, "payments": self.invoice.number, "history": "Ajuste exclusivo", "support-access": "Admin Dossier"}
        for section, search in matches.items():
            response = self.client.get(self.url(section), {"search": search})
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["count"], 1)
        User.objects.create_user(email="second@alfa.test", organization=self.organization)
        response = self.client.get(self.url("users"), {"page_size": 1})
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIn(str(self.organization.pk), response.data["next"])
        self.assertEqual(self.client.get(self.url("users"), {"page_size": 1, "page": 2}).status_code, 200)
        self.assertEqual(self.client.get(self.url("users"), {"search": "x" * 201}).status_code, 400)

    def test_audit_support_and_finance_follow_existing_permission_rules(self):
        support = self.staff("platform_support")
        own_grant = self.make_grant(self.organization, support)
        for role in ("platform_support", "platform_finance", "platform_auditor"):
            user = support if role == "platform_support" else self.staff(role)
            self.client.force_authenticate(user)
            detail = self.client.get(reverse("platform-organization-detail", args=[self.organization.pk]))
            self.assertFalse(detail.data["can_manage"])
            for section in ("registration", "users", "subscription", "invoices", "payments"):
                self.assertEqual(self.client.get(self.url(section)).status_code, 200)
            audit = self.client.get(self.url("history"))
            access = self.client.get(self.url("support-access"))
            self.assertEqual(audit.status_code, 200 if role == "platform_auditor" else 403)
            self.assertEqual(access.status_code, 200 if role == "platform_support" else 403)
            self.assertEqual("history" in detail.data["available_sections"], role == "platform_auditor")
            self.assertEqual("support-access" in detail.data["available_sections"], role == "platform_support")
            if role == "platform_support":
                self.assertEqual([row["id"] for row in access.data["results"]], [str(own_grant.pk)])

    def test_tenant_users_and_inactive_platform_staff_cannot_read_sections(self):
        self.client.force_authenticate(self.owner)
        for section in SECTIONS:
            self.assertEqual(self.client.get(self.url(section)).status_code, 403)
        self.admin.platform_staff_profile.is_active = False
        self.admin.platform_staff_profile.save()
        self.client.force_authenticate(self.admin)
        for section in SECTIONS:
            self.assertEqual(self.client.get(self.url(section)).status_code, 403)

    def test_empty_states_and_read_only_endpoints(self):
        empty = Organization.objects.create(name="Sem registros", slug="empty-dossier")
        empty.subscription.delete()
        for section in ("users", "invoices", "payments", "history", "support-access"):
            response = self.client.get(self.url(section, empty.pk))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["count"], 0)
        response = self.client.get(self.url("subscription", empty.pk))
        self.assertEqual(response.data, {"subscription": None})
        for section in SECTIONS:
            self.assertEqual(self.client.post(self.url(section), {}, format="json").status_code, 405)
            self.assertEqual(self.client.get(self.url(section, "00000000-0000-0000-0000-000000000000")).status_code, 404)
        self.assertEqual(self.client.get(self.url("users", "not-a-uuid")).status_code, 404)

    def test_related_records_do_not_add_one_query_per_row(self):
        def count_queries(section):
            with CaptureQueriesContext(connection) as captured:
                response = self.client.get(self.url(section), {"page_size": 100})
                self.assertEqual(response.status_code, 200)
            return len(captured)
        baseline = {section: count_queries(section) for section in ("users", "invoices", "payments", "history", "support-access")}
        for index in range(5):
            User.objects.create_user(email=f"extra-{index}@alfa.test", organization=self.organization)
            invoice = self.make_invoice(self.organization)
            record_manual_payment(invoice=invoice, amount=Decimal("10"))
            PlatformAuditLog.objects.create(organization=self.organization, actor=self.admin, action="organization.updated")
            self.make_grant(self.organization, self.admin)
        for section, expected in baseline.items():
            with self.subTest(section=section):
                self.assertLessEqual(count_queries(section), expected + 1)
