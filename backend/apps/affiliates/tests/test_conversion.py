import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Invoice, Plan
from apps.billing.services import record_manual_payment, refund_manual_payment
from apps.organizations.models import Organization

from ..models import AffiliateProfile, Commission, CommissionAdjustment, ReferralAttribution
from ..services import (
    create_commission_for_paid_invoice,
    record_first_touch,
    transition_commission_status,
)


class AffiliateConversionTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.paid_plan = Plan.objects.create(
            code="conversion-paid",
            name="Conversion Paid",
            monthly_price=Decimal("100.00"),
        )
        cls.affiliate_user = User.objects.create_user(
            email="conversion-affiliate@example.com",
            password="password123",
            full_name="Conversion Affiliate",
        )
        cls.affiliate = AffiliateProfile.objects.create(
            user=cls.affiliate_user,
            commission_type=AffiliateProfile.CommissionType.PERCENTAGE,
            commission_value=Decimal("12.50"),
        )

    def create_referred_customer(self, suffix):
        customer = User.objects.create_user(
            email=f"customer-{suffix}@example.com",
            password="password123",
            full_name=f"Customer {suffix}",
        )
        organization = Organization.objects.create(
            name=f"Customer Org {suffix}",
            slug=f"customer-org-{suffix}",
        )
        customer.organization = organization
        customer.save(update_fields=["organization", "updated_at"])
        subscription = organization.subscription
        subscription.plan = self.paid_plan
        subscription.save(update_fields=["plan", "updated_at"])
        _, attribution, _ = record_first_touch(
            affiliate=self.affiliate,
            visitor_id=uuid.uuid4(),
        )
        attribution.user = customer
        attribution.organization = organization
        attribution.status = ReferralAttribution.Status.REGISTERED
        attribution.registered_at = timezone.now()
        attribution.save(
            update_fields=["user", "organization", "status", "registered_at", "updated_at"]
        )
        return customer, organization, attribution

    def create_invoice(self, organization, *, number, total=Decimal("100.00")):
        return Invoice.objects.create(
            number=number,
            organization=organization,
            subscription=organization.subscription,
            status=Invoice.Status.OPEN,
            subtotal=total,
            total=total,
            due_date=timezone.localdate() + timedelta(days=5),
        )

    def test_full_payment_generates_pending_commission_with_snapshot(self):
        _customer, organization, attribution = self.create_referred_customer("full")
        invoice = self.create_invoice(organization, number="CONVERSION-001")

        payment = record_manual_payment(invoice=invoice, amount=Decimal("100.00"))

        commission = Commission.objects.get(invoice=invoice)
        self.assertEqual(commission.payment, payment)
        self.assertEqual(commission.status, Commission.Status.PENDING)
        self.assertEqual(commission.transaction_amount, Decimal("100.00"))
        self.assertEqual(commission.commission_rate_snapshot, Decimal("12.50"))
        self.assertEqual(
            commission.commission_duration_snapshot,
            AffiliateProfile.CommissionDuration.FIRST_PAYMENT,
        )
        self.assertEqual(commission.commission_amount, Decimal("12.50"))
        self.assertEqual(commission.status_history.count(), 1)
        attribution.refresh_from_db()
        self.assertEqual(attribution.status, ReferralAttribution.Status.CONVERTED)

        self.affiliate.commission_value = Decimal("30.00")
        self.affiliate.save(update_fields=["commission_value", "updated_at"])
        commission.refresh_from_db()
        self.assertEqual(commission.commission_rate_snapshot, Decimal("12.50"))

    def test_partial_payment_only_generates_on_final_settlement(self):
        _customer, organization, _attribution = self.create_referred_customer("partial")
        invoice = self.create_invoice(organization, number="CONVERSION-002")

        record_manual_payment(invoice=invoice, amount=Decimal("40.00"))
        self.assertFalse(Commission.objects.filter(invoice=invoice).exists())
        invoice.refresh_from_db()
        final_payment = record_manual_payment(invoice=invoice, amount=Decimal("60.00"))

        commission = Commission.objects.get(invoice=invoice)
        self.assertEqual(commission.payment, final_payment)
        self.assertEqual(commission.transaction_amount, Decimal("100.00"))

    def test_processing_paid_invoice_twice_is_idempotent(self):
        _customer, organization, _attribution = self.create_referred_customer("duplicate")
        invoice = self.create_invoice(organization, number="CONVERSION-003")
        record_manual_payment(invoice=invoice, amount=Decimal("100.00"))
        invoice.refresh_from_db()

        existing, created = create_commission_for_paid_invoice(invoice=invoice)

        self.assertFalse(created)
        self.assertEqual(existing, Commission.objects.get(invoice=invoice))
        self.assertEqual(Commission.objects.filter(invoice=invoice).count(), 1)

    def test_only_first_paid_contract_generates_commission(self):
        _customer, organization, _attribution = self.create_referred_customer("renewal")
        first_invoice = self.create_invoice(organization, number="CONVERSION-004")
        second_invoice = self.create_invoice(organization, number="CONVERSION-005")

        record_manual_payment(invoice=first_invoice, amount=Decimal("100.00"))
        record_manual_payment(invoice=second_invoice, amount=Decimal("100.00"))

        self.assertEqual(Commission.objects.filter(organization=organization).count(), 1)
        self.assertFalse(Commission.objects.filter(invoice=second_invoice).exists())

    def test_first_three_payments_generate_three_commissions(self):
        self.affiliate.commission_duration = (
            AffiliateProfile.CommissionDuration.FIRST_THREE_PAYMENTS
        )
        self.affiliate.save(update_fields=["commission_duration", "updated_at"])
        _customer, organization, _attribution = self.create_referred_customer("three-payments")

        for index in range(4):
            invoice = self.create_invoice(
                organization,
                number=f"CONVERSION-THREE-{index}",
            )
            record_manual_payment(invoice=invoice, amount=Decimal("100.00"))

        self.assertEqual(Commission.objects.filter(organization=organization).count(), 3)

    def test_permanent_rule_generates_commission_for_every_payment(self):
        self.affiliate.commission_duration = AffiliateProfile.CommissionDuration.PERMANENT
        self.affiliate.save(update_fields=["commission_duration", "updated_at"])
        _customer, organization, _attribution = self.create_referred_customer("permanent")

        for index in range(4):
            invoice = self.create_invoice(
                organization,
                number=f"CONVERSION-PERMANENT-{index}",
            )
            record_manual_payment(invoice=invoice, amount=Decimal("100.00"))

        self.assertEqual(Commission.objects.filter(organization=organization).count(), 4)

    def test_free_plan_payment_does_not_generate_commission(self):
        _customer, organization, _attribution = self.create_referred_customer("free")
        free_plan = Plan.objects.get(code="free")
        organization.subscription.plan = free_plan
        organization.subscription.save(update_fields=["plan", "updated_at"])
        invoice = self.create_invoice(organization, number="CONVERSION-006")

        record_manual_payment(invoice=invoice, amount=Decimal("100.00"))

        self.assertFalse(Commission.objects.filter(invoice=invoice).exists())

    def test_refund_cancels_pending_commission(self):
        _customer, organization, _attribution = self.create_referred_customer("refund-pending")
        invoice = self.create_invoice(organization, number="CONVERSION-007")
        payment = record_manual_payment(invoice=invoice, amount=Decimal("100.00"))

        refund_manual_payment(payment=payment, reason="Cliente solicitou reembolso")

        commission = Commission.objects.get(invoice=invoice)
        self.assertEqual(commission.status, Commission.Status.CANCELLED)
        self.assertEqual(commission.status_history.last().new_status, Commission.Status.CANCELLED)
        invoice.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.OPEN)
        self.assertEqual(invoice.amount_paid, Decimal("0.00"))
        self.assertEqual(payment.status, payment.Status.REFUNDED)

    def test_refund_of_paid_commission_creates_reversal_adjustment(self):
        _customer, organization, _attribution = self.create_referred_customer("refund-paid")
        invoice = self.create_invoice(organization, number="CONVERSION-008")
        payment = record_manual_payment(invoice=invoice, amount=Decimal("100.00"))
        commission = Commission.objects.get(invoice=invoice)
        commission = transition_commission_status(
            commission=commission,
            new_status=Commission.Status.APPROVED,
            reason="Validada",
        )
        transition_commission_status(
            commission=commission,
            new_status=Commission.Status.PAID,
            reason="Pagamento ao afiliado",
        )

        refund_manual_payment(payment=payment, reason="Chargeback confirmado")
        refund_manual_payment(payment=payment, reason="Reprocessamento idempotente")

        commission.refresh_from_db()
        adjustment = CommissionAdjustment.objects.get(commission=commission)
        self.assertEqual(commission.status, Commission.Status.PAID)
        self.assertEqual(adjustment.amount, commission.commission_amount)
        self.assertEqual(CommissionAdjustment.objects.filter(payment=payment).count(), 1)
