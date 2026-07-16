from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import Plan, Subscription
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformBillingAPITestCase(APITestCase):
    def setUp(self):
        self.platform_admin = User.objects.create_user(
            email="billing-admin@platform.local",
            password="PlatformPassword-8472",
            full_name="Billing Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.platform_admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )
        self.organization = Organization.objects.create(name="Cliente Billing", slug="cliente-billing")
        self.free_plan = Plan.objects.get(code="free")

    def test_new_organization_receives_default_subscription(self):
        subscription = Subscription.objects.get(organization=self.organization)

        self.assertEqual(subscription.plan, self.free_plan)
        self.assertEqual(subscription.status, Subscription.Status.ACTIVE)

    def test_platform_admin_can_create_configurable_plan(self):
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(
            reverse("platform-plan-list"),
            {
                "code": "growth",
                "name": "Growth",
                "monthly_price": "199.90",
                "yearly_price": "1999.00",
                "max_users": 12,
                "max_farms": 5,
                "is_active": True,
                "is_public": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Plan.objects.filter(code="growth").exists())
        self.assertTrue(PlatformAuditLog.objects.filter(action="plan.created").exists())

    def test_platform_admin_changes_subscription_plan_and_audits(self):
        pro_plan = Plan.objects.get(code="pro")
        subscription = self.organization.subscription
        self.client.force_authenticate(user=self.platform_admin)

        response = self.client.post(
            reverse("platform-subscription-change-plan", args=[subscription.id]),
            {"plan_id": str(pro_plan.id), "billing_cycle": "yearly"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        subscription.refresh_from_db()
        self.organization.refresh_from_db()
        self.assertEqual(subscription.plan, pro_plan)
        self.assertEqual(subscription.billing_cycle, "yearly")
        self.assertEqual(self.organization.plan, "pro")
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="subscription.plan_changed").exists()
        )

    def test_support_can_read_plans_but_cannot_create(self):
        support = User.objects.create_user(
            email="billing-support@platform.local",
            password="SupportPassword-8472",
            full_name="Billing Support",
        )
        PlatformStaffProfile.objects.create(
            user=support,
            role=PlatformStaffProfile.Role.SUPPORT,
        )
        self.client.force_authenticate(user=support)

        list_response = self.client.get(reverse("platform-plan-list"))
        create_response = self.client.post(
            reverse("platform-plan-list"),
            {"code": "blocked", "name": "Blocked"},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
