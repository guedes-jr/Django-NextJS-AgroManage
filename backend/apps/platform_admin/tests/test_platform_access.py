from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.billing.models import Plan, Subscription
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

    def test_platform_admin_creates_organization_with_selected_subscription(self):
        plan = Plan.objects.get(code="pro")
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(
            reverse("platform-organization-list"),
            {
                "name": "Nova Organização",
                "document": "12.345.678/0001-90",
                "email": "contato@nova.test",
                "phone": "(11) 99999-0000",
                "address": "Rua Principal, 100",
                "plan_id": str(plan.id),
                "billing_cycle": Subscription.BillingCycle.YEARLY,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        organization = Organization.objects.get(name="Nova Organização")
        self.assertEqual(organization.slug, "nova-organizacao")
        self.assertEqual(organization.subscription.plan, plan)
        self.assertEqual(organization.subscription.billing_cycle, Subscription.BillingCycle.YEARLY)
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.created", organization=organization).exists())

    def test_platform_admin_updates_organization_and_plan(self):
        plan = Plan.objects.get(code="starter")
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.patch(
            reverse("platform-organization-detail", args=[self.org_a.id]),
            {
                "name": "Organização Atualizada",
                "email": "novo@email.test",
                "plan_id": str(plan.id),
                "billing_cycle": Subscription.BillingCycle.MONTHLY,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.org_a.refresh_from_db()
        self.assertEqual(self.org_a.name, "Organização Atualizada")
        self.assertEqual(self.org_a.email, "novo@email.test")
        self.assertEqual(self.org_a.subscription.plan, plan)
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.updated", organization=self.org_a).exists())

    def test_archive_preserves_organization_and_revokes_member_sessions(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(
            reverse("platform-organization-archive", args=[self.org_a.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.org_a.refresh_from_db()
        self.customer_owner.refresh_from_db()
        self.assertFalse(self.org_a.is_active)
        self.assertEqual(self.customer_owner.session_version, 1)
        self.assertTrue(Organization.objects.filter(pk=self.org_a.id).exists())
        self.assertTrue(PlatformAuditLog.objects.filter(action="organization.archived", organization=self.org_a).exists())

    def test_support_cannot_create_or_edit_organization(self):
        support = User.objects.create_user(
            email="support-write@example.com",
            password="password123",
            full_name="Platform Support",
        )
        PlatformStaffProfile.objects.create(user=support, role=PlatformStaffProfile.Role.SUPPORT)
        plan = Plan.objects.get(code="free")
        self.client.force_authenticate(user=support)

        create_response = self.client.post(
            reverse("platform-organization-list"),
            {"name": "Bloqueada", "plan_id": str(plan.id)},
            format="json",
        )
        update_response = self.client.patch(
            reverse("platform-organization-detail", args=[self.org_a.id]),
            {"name": "Tentativa", "plan_id": str(plan.id)},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)
