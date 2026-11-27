from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

from .gateways.base import GatewayResult, PaymentGatewayError
from .models import Invoice, Payment, PaymentGatewayConfiguration, Plan, PlanSegment, PlanTier, Subscription, SubscriptionItem
from .recurring import apply_delinquency, charge_invoice, cycle_preview, issue_cycle_invoice, roll_period, run_cycle
from .services import record_manual_payment


def aware(day):
    return timezone.make_aware(datetime.combine(day, time.min))


@override_settings(BILLING_AUTO_INVOICING_ENABLED=True, BILLING_INVOICE_LEAD_DAYS=7, BILLING_SUSPEND_AFTER_DAYS=15)
class RecurringBillingTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Fazenda Ciclo", slug="fazenda-ciclo", document="12345678000190", email="c@example.com")
        plan = Plan.objects.first() or Plan.objects.create(code="segmentado", name="Segmentado")
        self.subscription = Subscription.objects.filter(organization=self.org).first() or Subscription.objects.create(organization=self.org, plan=plan, started_at=timezone.now())
        self.subscription.items.all().delete()
        self.subscription.status = Subscription.Status.ACTIVE
        self.subscription.current_period_ends_at = aware(date(2027, 1, 1))
        self.subscription.save()
        self.item("plantacoes", Decimal("39.90"))
        self.item("suinocultura", Decimal("59.90"))
        self.item("gado-de-corte", None)  # sob consulta: left out of the invoice

    def item(self, code, price):
        segment = PlanSegment.objects.get_or_create(code=code, defaults={"name": code.title()})[0]
        tier = PlanTier.objects.get_or_create(segment=segment, label=f"Faixa {code}", defaults={"monthly_price": price, "requires_quote": price is None})[0]
        return SubscriptionItem.objects.create(subscription=self.subscription, tier=tier, segment_code=code, segment_name=segment.name, segment_subtitle="",
                                               tier_label=tier.label, monthly_price=price, discount_percent=0, final_monthly_price=price)

    def test_preview_and_issue_respect_lead_window_and_are_idempotent(self):
        preview = cycle_preview(self.subscription)
        self.assertEqual(preview["total"], Decimal("99.80"))
        self.assertEqual(len(preview["unpriced"]), 1)
        self.assertEqual((preview["period_start"], preview["period_end"]), (date(2027, 1, 1), date(2027, 1, 31)))
        self.assertIsNone(issue_cycle_invoice(self.subscription, today=date(2026, 12, 24)))
        invoice = issue_cycle_invoice(self.subscription, today=date(2026, 12, 25))
        self.assertEqual((invoice.total, invoice.due_date, invoice.items.count()), (Decimal("99.80"), date(2027, 1, 1), 2))
        self.assertEqual(issue_cycle_invoice(self.subscription, today=date(2026, 12, 26)).pk, invoice.pk)
        self.assertEqual(Invoice.objects.filter(subscription=self.subscription).count(), 1)

    def test_yearly_cycle_charges_twelve_months(self):
        self.subscription.billing_cycle = Subscription.BillingCycle.YEARLY
        self.subscription.save()
        preview = cycle_preview(self.subscription)
        self.assertEqual((preview["total"], preview["period_end"]), (Decimal("1197.60"), date(2027, 12, 31)))

    def test_period_rolls_only_after_its_invoice_and_cancel_at_end(self):
        self.assertFalse(roll_period(self.subscription, now=aware(date(2027, 1, 2))))
        issue_cycle_invoice(self.subscription, today=date(2026, 12, 30))
        self.assertTrue(roll_period(self.subscription, now=aware(date(2027, 1, 2))))
        self.assertEqual(timezone.localtime(self.subscription.current_period_ends_at).date(), date(2027, 2, 1))
        self.subscription.cancel_at_period_end = True
        self.subscription.save()
        self.assertIsNone(issue_cycle_invoice(self.subscription, today=date(2027, 1, 30)))
        self.assertTrue(roll_period(self.subscription, now=aware(date(2027, 2, 2))))
        self.assertEqual(self.subscription.status, Subscription.Status.CANCELLED)

    def test_delinquency_suspends_and_payment_reactivates(self):
        invoice = issue_cycle_invoice(self.subscription, today=date(2026, 12, 30))
        apply_delinquency(today=date(2027, 1, 5))
        self.subscription.refresh_from_db(); invoice.refresh_from_db()
        self.assertEqual((invoice.status, self.subscription.status), (Invoice.Status.OVERDUE, Subscription.Status.PAST_DUE))
        apply_delinquency(today=date(2027, 1, 16))
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.SUSPENDED)
        record_manual_payment(invoice=invoice, amount=invoice.total)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)

    @override_settings(BILLING_AUTO_INVOICING_ENABLED=False)
    def test_disabled_cycle_does_nothing(self):
        self.assertEqual(run_cycle(today=date(2026, 12, 30)), {"enabled": False})
        self.assertFalse(Invoice.objects.exists())

    def test_start_billing_dry_run_writes_nothing(self):
        self.subscription.current_period_ends_at = None
        self.subscription.save()
        call_command("start_billing", "--date", "2027-03-01", "--dry-run", stdout=open("/dev/null", "w"))
        self.subscription.refresh_from_db()
        self.assertIsNone(self.subscription.current_period_ends_at)
        call_command("start_billing", "--date", "2027-03-01", stdout=open("/dev/null", "w"))
        self.subscription.refresh_from_db()
        self.assertEqual(timezone.localtime(self.subscription.current_period_ends_at).date(), date(2027, 3, 1))


@override_settings(BILLING_AUTO_INVOICING_ENABLED=True)
class GatewayChargeTests(RecurringBillingTests.__base__):
    def setUp(self):
        RecurringBillingTests.setUp(self)
        self.configuration = PaymentGatewayConfiguration.objects.get(provider="asaas")
        self.configuration.set_credentials({"api_key": "$aact", "webhook_token": "tok"})
        self.configuration.is_enabled = self.configuration.is_default = True
        self.configuration.save()
        self.invoice = issue_cycle_invoice(self.subscription, today=date(2026, 12, 30))

    item = RecurringBillingTests.item

    @patch("apps.billing.gateways.asaas.AsaasGateway.create_charge")
    def test_charge_once_then_webhook_settles_and_repeats_are_ignored(self, create_charge):
        create_charge.return_value = GatewayResult(external_id="pay_9", status="pending", raw={"invoiceUrl": "https://asaas/i/pay_9"})
        payment = charge_invoice(self.invoice)
        self.assertEqual((payment.provider, payment.external_id, payment.payment_method), ("asaas", "pay_9", "any"))
        self.assertEqual(payment.metadata["payment_url"], "https://asaas/i/pay_9")
        self.assertEqual(charge_invoice(self.invoice).pk, payment.pk)
        self.assertEqual(create_charge.call_count, 1)
        url = reverse("billing-gateway-webhook", args=["asaas"])
        body = '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_9","status":"RECEIVED"}}'
        self.assertEqual(self.client.post(url, body, content_type="application/json", HTTP_ASAAS_ACCESS_TOKEN="bad").status_code, 401)
        for _ in range(2):
            self.assertEqual(self.client.post(url, body, content_type="application/json", HTTP_ASAAS_ACCESS_TOKEN="tok").status_code, 200)
        self.invoice.refresh_from_db(); payment.refresh_from_db()
        self.assertEqual((self.invoice.status, self.invoice.amount_paid, payment.status), (Invoice.Status.PAID, Decimal("99.80"), Payment.Status.SUCCEEDED))
        self.assertEqual(Payment.objects.filter(invoice=self.invoice, status=Payment.Status.SUCCEEDED).count(), 1)

    @patch("apps.billing.gateways.asaas.AsaasGateway.create_charge", side_effect=PaymentGatewayError("fora do ar"))
    def test_gateway_failure_keeps_invoice_open_for_retry(self, create_charge):
        self.assertIsNone(charge_invoice(self.invoice))
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.OPEN)
        self.assertEqual(Payment.objects.get(invoice=self.invoice).status, Payment.Status.FAILED)

    def test_unknown_charge_is_acknowledged(self):
        url = reverse("billing-gateway-webhook", args=["asaas"])
        body = '{"payment":{"id":"pay_x","status":"RECEIVED"}}'
        self.assertEqual(self.client.post(url, body, content_type="application/json", HTTP_ASAAS_ACCESS_TOKEN="tok").status_code, 200)


class CustomerInvoicesTests(APITestCase):
    def test_admin_sees_invoices_with_payment_link_and_operator_does_not(self):
        from django.contrib.auth import get_user_model

        org = Organization.objects.create(name="Cliente Faturas", slug="cliente-faturas")
        User = get_user_model()
        admin = User.objects.create_user(email="adm@faturas.test", password="Strong-8472x", organization=org, role="admin")
        operator = User.objects.create_user(email="op@faturas.test", password="Strong-8472x", organization=org, role="operator")
        from .services import create_manual_invoice

        invoice = create_manual_invoice(organization=org, due_date=timezone.localdate() - timedelta(days=2), description="Ciclo", amount=Decimal("50"))
        Payment.objects.create(invoice=invoice, organization=org, amount=Decimal("50"), status=Payment.Status.PENDING, provider="asaas", external_id="pay_c", metadata={"payment_url": "https://asaas/i/pay_c"})
        url = reverse("my-invoices")
        self.client.force_authenticate(operator)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(admin)
        row = self.client.get(url).data["results"][0]
        self.assertEqual((row["number"], row["payment_url"], row["overdue"], row["balance"]), (invoice.number, "https://asaas/i/pay_c", True, "50.00"))
