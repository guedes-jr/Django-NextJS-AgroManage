import uuid
from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.billing.models import Invoice, Plan
from apps.billing.services import record_manual_payment
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

from ..models import AffiliateProfile, Commission, ReferralAttribution
from ..services import record_first_touch


class AffiliatePlatformAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="affiliate-admin@platform.local",
            password="password123",
            full_name="Affiliate Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=cls.admin,
            role=PlatformStaffProfile.Role.ADMIN,
        )
        cls.regular_user = User.objects.create_user(
            email="affiliate-no-access@example.com",
            password="password123",
            full_name="No Access",
        )
        cls.candidate = User.objects.create_user(
            email="affiliate-candidate@example.com",
            password="password123",
            full_name="Affiliate Candidate",
        )
        cls.paid_plan = Plan.objects.create(
            code="platform-affiliate-paid",
            name="Platform Affiliate Paid",
            monthly_price=Decimal("200.00"),
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_admin_creates_updates_and_deactivates_affiliate_with_audit(self):
        created = self.client.post(
            reverse("platform-affiliate-list"),
            {
                "user_id": str(self.candidate.id),
                "commission_type": "percentage",
                "commission_value": "18.00",
                "commission_duration": "first_three_payments",
                "currency": "BRL",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["commission_duration"], "first_three_payments")
        affiliate_id = created.data["id"]

        updated = self.client.patch(
            reverse("platform-affiliate-detail", args=[affiliate_id]),
            {"commission_type": "fixed_amount", "commission_value": "75.00"},
            format="json",
        )
        deactivated = self.client.post(
            reverse("platform-affiliate-deactivate", args=[affiliate_id]),
            {},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["commission_value"], "75.00")
        self.assertEqual(deactivated.status_code, status.HTTP_200_OK)
        self.assertEqual(deactivated.data["status"], AffiliateProfile.Status.INACTIVE)
        self.assertTrue(PlatformAuditLog.objects.filter(action="affiliate.created").exists())
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="affiliate.commission_updated").exists()
        )
        self.assertTrue(PlatformAuditLog.objects.filter(action="affiliate.inactive").exists())

    def test_invalid_percentage_is_rejected(self):
        response = self.client.post(
            reverse("platform-affiliate-list"),
            {
                "user_id": str(self.candidate.id),
                "commission_type": "percentage",
                "commission_value": "100.01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_creates_dedicated_affiliate_account(self):
        response = self.client.post(
            reverse("platform-affiliate-list"),
            {
                "full_name": "Dedicated Seller",
                "email": "dedicated-seller@example.com",
                "initial_password": "DedicatedPassword123",
                "commission_type": "percentage",
                "commission_value": "15.00",
                "currency": "BRL",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        seller = User.objects.get(email="dedicated-seller@example.com")
        self.assertIsNone(seller.organization)
        self.assertTrue(seller.affiliate_profile.portal_access_only)
        self.assertTrue(seller.check_password("DedicatedPassword123"))
        customer_directory = self.client.get(reverse("platform-user-list"), {"search": seller.email})
        self.assertEqual(customer_directory.status_code, status.HTTP_200_OK)
        self.assertEqual(customer_directory.data["count"], 0)

    def test_non_platform_admin_cannot_access_program(self):
        self.client.force_authenticate(self.regular_user)
        response = self.client.get(reverse("platform-affiliate-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def create_commission(self):
        affiliate = AffiliateProfile.objects.create(
            user=self.candidate,
            commission_value=Decimal("10.00"),
        )
        customer = User.objects.create_user(
            email=f"platform-customer-{uuid.uuid4()}@example.com",
            password="password123",
            full_name="Platform Customer",
        )
        organization = Organization.objects.create(
            name=f"Platform Customer {uuid.uuid4()}",
            slug=f"platform-customer-{uuid.uuid4()}",
        )
        customer.organization = organization
        customer.save(update_fields=["organization", "updated_at"])
        organization.subscription.plan = self.paid_plan
        organization.subscription.save(update_fields=["plan", "updated_at"])
        _, attribution, _ = record_first_touch(
            affiliate=affiliate,
            visitor_id=uuid.uuid4(),
        )
        attribution.user = customer
        attribution.organization = organization
        attribution.status = ReferralAttribution.Status.REGISTERED
        attribution.registered_at = timezone.now()
        attribution.save()
        invoice = Invoice.objects.create(
            number=f"PLATFORM-AFF-{uuid.uuid4()}",
            organization=organization,
            subscription=organization.subscription,
            status=Invoice.Status.OPEN,
            subtotal=Decimal("200.00"),
            total=Decimal("200.00"),
            due_date=timezone.localdate() + timedelta(days=5),
        )
        record_manual_payment(invoice=invoice, amount=Decimal("200.00"))
        return Commission.objects.get(invoice=invoice)

    def test_admin_approves_and_marks_commission_as_paid(self):
        commission = self.create_commission()

        approved = self.client.post(
            reverse("platform-affiliate-commission-approve", args=[commission.id]),
            {"reason": "Contratação conferida"},
            format="json",
        )
        paid = self.client.post(
            reverse("platform-affiliate-commission-mark-paid", args=[commission.id]),
            {"reason": "Pagamento PIX realizado"},
            format="json",
        )

        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.data["status"], Commission.Status.PAID)
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="affiliate_commission.paid").exists()
        )

    def test_dashboard_reports_program_totals(self):
        commission = self.create_commission()
        response = self.client.get(reverse("platform-affiliate-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["affiliates"], 1)
        self.assertEqual(response.data["clicks"], 1)
        self.assertEqual(response.data["registrations"], 1)
        self.assertEqual(response.data["conversions"], 1)
        self.assertEqual(response.data["commissions"]["generated"], commission.commission_amount)

    def test_invalid_commission_transition_returns_validation_error(self):
        commission = self.create_commission()
        response = self.client.post(
            reverse("platform-affiliate-commission-mark-paid", args=[commission.id]),
            {"reason": "Tentativa sem aprovação"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
