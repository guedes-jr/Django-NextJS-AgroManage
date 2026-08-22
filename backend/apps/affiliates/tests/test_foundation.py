import uuid
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Invoice, Plan
from apps.organizations.models import Organization

from ..models import AffiliateProfile, Commission, ReferralAttribution
from ..services import (
    calculate_commission_amount,
    record_first_touch,
    set_affiliate_status,
    transition_commission_status,
)


class AffiliateFoundationTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.free_plan, _ = Plan.objects.get_or_create(code="free", defaults={"name": "Grátis"})
        cls.paid_plan, _ = Plan.objects.get_or_create(
            code="affiliate-test-pro",
            defaults={"name": "Pro afiliados", "monthly_price": Decimal("100.00")},
        )
        cls.affiliate_user = User.objects.create_user(
            email="affiliate@example.com",
            password="password123",
            full_name="Affiliate",
        )
        cls.other_affiliate_user = User.objects.create_user(
            email="affiliate2@example.com",
            password="password123",
            full_name="Affiliate Two",
        )
        cls.customer = User.objects.create_user(
            email="customer@example.com",
            password="password123",
            full_name="Customer",
        )
        cls.actor = User.objects.create_user(
            email="admin@example.com",
            password="password123",
            full_name="Admin",
        )
        cls.affiliate = AffiliateProfile.objects.create(
            user=cls.affiliate_user,
            commission_type=AffiliateProfile.CommissionType.PERCENTAGE,
            commission_value=Decimal("10.00"),
        )
        cls.other_affiliate = AffiliateProfile.objects.create(
            user=cls.other_affiliate_user,
            commission_value=Decimal("20.00"),
        )

    def test_generates_distinct_public_codes(self):
        self.assertNotEqual(self.affiliate.code, self.other_affiliate.code)
        self.assertEqual(len(self.affiliate.code), 12)

    def test_rejects_percentage_above_one_hundred(self):
        self.affiliate.commission_value = Decimal("100.01")
        with self.assertRaises(ValidationError):
            self.affiliate.full_clean()

    def test_calculates_percentage_and_caps_fixed_commission(self):
        percentage = calculate_commission_amount(
            transaction_amount="199.90",
            commission_type=AffiliateProfile.CommissionType.PERCENTAGE,
            commission_value="12.50",
        )
        fixed = calculate_commission_amount(
            transaction_amount="40.00",
            commission_type=AffiliateProfile.CommissionType.FIXED_AMOUNT,
            commission_value="50.00",
        )
        self.assertEqual(percentage, Decimal("24.99"))
        self.assertEqual(fixed, Decimal("40.00"))

    def test_first_valid_touch_is_preserved(self):
        visitor_id = uuid.uuid4()
        _, first_attribution, created = record_first_touch(
            affiliate=self.affiliate,
            visitor_id=visitor_id,
            landing_path="/login?ref=FIRST",
        )
        _, repeated_attribution, repeated_created = record_first_touch(
            affiliate=self.other_affiliate,
            visitor_id=visitor_id,
            landing_path="/login?ref=SECOND",
        )
        self.assertTrue(created)
        self.assertFalse(repeated_created)
        self.assertEqual(repeated_attribution.pk, first_attribution.pk)
        self.assertEqual(repeated_attribution.affiliate, self.affiliate)
        self.assertEqual(self.affiliate.visits.count(), 1)
        self.assertEqual(self.other_affiliate.visits.count(), 1)

    def test_inactive_affiliate_cannot_receive_first_touch(self):
        set_affiliate_status(
            affiliate=self.affiliate,
            status=AffiliateProfile.Status.INACTIVE,
        )
        with self.assertRaises(ValidationError):
            record_first_touch(affiliate=self.affiliate, visitor_id=uuid.uuid4())

    def test_database_prevents_two_active_attributions_for_visitor(self):
        visitor_id = uuid.uuid4()
        visit, _, _ = record_first_touch(
            affiliate=self.affiliate,
            visitor_id=visitor_id,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            ReferralAttribution.objects.create(
                affiliate=self.other_affiliate,
                visitor_id=visitor_id,
                first_visit=visit,
                attributed_at=timezone.now(),
            )

    def test_commission_status_transitions_are_audited(self):
        visitor_id = uuid.uuid4()
        _, attribution, _ = record_first_touch(
            affiliate=self.affiliate,
            visitor_id=visitor_id,
        )
        organization = Organization.objects.create(name="Customer Org", slug="customer-org")
        self.customer.organization = organization
        self.customer.save(update_fields=["organization"])
        subscription = organization.subscription
        subscription.plan = self.paid_plan
        subscription.save(update_fields=["plan", "updated_at"])
        attribution.user = self.customer
        attribution.organization = organization
        attribution.status = ReferralAttribution.Status.REGISTERED
        attribution.registered_at = timezone.now()
        attribution.save()
        invoice = Invoice.objects.create(
            number="AFF-TEST-001",
            organization=organization,
            subscription=subscription,
            status=Invoice.Status.PAID,
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
            amount_paid=Decimal("100.00"),
            due_date=date.today(),
            paid_at=timezone.now(),
        )
        commission = Commission.objects.create(
            affiliate=self.affiliate,
            attribution=attribution,
            customer_user=self.customer,
            organization=organization,
            subscription=subscription,
            plan=self.paid_plan,
            invoice=invoice,
            transaction_amount=Decimal("100.00"),
            commission_type_snapshot=AffiliateProfile.CommissionType.PERCENTAGE,
            commission_rate_snapshot=Decimal("10.00"),
            commission_amount=Decimal("10.00"),
            conversion_at=timezone.now(),
        )

        commission = transition_commission_status(
            commission=commission,
            new_status=Commission.Status.APPROVED,
            actor=self.actor,
            reason="Venda validada",
        )
        commission = transition_commission_status(
            commission=commission,
            new_status=Commission.Status.PAID,
            actor=self.actor,
            reason="Lote de pagamento 1",
        )

        self.assertEqual(commission.status, Commission.Status.PAID)
        self.assertEqual(
            list(commission.status_history.values_list("new_status", flat=True)),
            [Commission.Status.APPROVED, Commission.Status.PAID],
        )
        with self.assertRaises(ValidationError):
            transition_commission_status(
                commission=commission,
                new_status=Commission.Status.CANCELLED,
                actor=self.actor,
            )
