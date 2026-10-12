from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import Invoice, Payment, Plan
from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile

User = get_user_model()


class PlatformFinanceAPITestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="finance-admin@platform.local",
            password="PlatformPassword-8472",
            full_name="Finance Admin",
            is_staff=True,
        )
        PlatformStaffProfile.objects.create(
            user=self.admin, role=PlatformStaffProfile.Role.ADMIN
        )
        self.organization = Organization.objects.create(
            name="Cliente Finance", slug="cliente-finance"
        )
        plan = Plan.objects.get(code="pro")
        plan.monthly_price = "249.90"
        plan.save(update_fields=["monthly_price", "updated_at"])
        subscription = self.organization.subscription
        subscription.plan = plan
        subscription.save(update_fields=["plan", "updated_at"])
        self.client.force_authenticate(user=self.admin)

    def test_creates_invoice_and_records_payment(self):
        create_response = self.client.post(
            reverse("platform-invoice-list"),
            {
                "organization_id": str(self.organization.id),
                "due_date": str(timezone.localdate() + timedelta(days=10)),
                "description": "Mensalidade Pro",
                "amount": "249.90",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        invoice = Invoice.objects.get(pk=create_response.data["id"])
        self.assertEqual(invoice.items.count(), 1)

        payment_response = self.client.post(
            reverse("platform-invoice-record-payment", args=[invoice.id]),
            {"amount": "249.90", "payment_method": "pix"},
            format="json",
        )
        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertEqual(Payment.objects.filter(invoice=invoice).count(), 1)
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="payment.recorded").exists()
        )

    def test_finance_dashboard_calculates_mrr(self):
        response = self.client.get(reverse("platform-finance-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mrr"], Decimal("249.90"))
        self.assertEqual(response.data["active_subscriptions"], 1)

    def make_invoice(self, amount="100", days=0, description="Mensalidade"):
        from apps.billing.services import create_manual_invoice

        return create_manual_invoice(
            organization=self.organization,
            due_date=timezone.localdate() + timedelta(days=days),
            description=description,
            amount=Decimal(amount),
        )

    def test_filters_are_shared_by_dashboard_list_and_report(self):
        invoice = self.make_invoice("200", -2, "Cobrança especial")
        self.make_invoice("900", 20, "Outra cobrança")
        params = {
            "search": "especial",
            "status": "overdue",
            "organization": str(self.organization.pk),
            "date_from": str(timezone.localdate() - timedelta(days=3)),
            "date_to": str(timezone.localdate()),
        }
        listing = self.client.get(reverse("platform-invoice-list"), params)
        dashboard = self.client.get(reverse("platform-finance-dashboard"), params)
        report = self.client.get(reverse("platform-invoice-report"), params)
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(dashboard.data["outstanding"], Decimal(200))
        self.assertEqual(dashboard.data["overdue_amount"], Decimal(200))
        self.assertEqual(dashboard.data["overdue_rate"], 100)
        self.assertEqual(report.status_code, 200)
        self.assertEqual(
            [row["id"] for row in report.data["invoices"]], [str(invoice.pk)]
        )
        self.assertTrue(
            PlatformAuditLog.objects.filter(action="finance.report_exported").exists()
        )

    def test_partial_payment_keeps_date_notes_and_remaining_balance(self):
        invoice = self.make_invoice("200")
        paid_at = timezone.now() - timedelta(days=2)
        response = self.client.post(
            reverse("platform-invoice-record-payment", args=[invoice.pk]),
            {
                "amount": "80",
                "payment_method": "pix",
                "paid_at": paid_at.isoformat(),
                "notes": "Primeira parcela",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(invoice=invoice)
        self.assertEqual(payment.paid_at, paid_at)
        self.assertEqual(payment.metadata["notes"], "Primeira parcela")
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount_due, Decimal(120))
        self.assertEqual(invoice.status, "open")
        details = self.client.get(
            reverse("platform-invoice-details", args=[invoice.pk])
        )
        self.assertEqual(details.data["payments"][0]["notes"], "Primeira parcela")

    def test_overpayment_and_future_payment_are_rejected(self):
        invoice = self.make_invoice("100")
        for payload in [
            {"amount": "101"},
            {
                "amount": "20",
                "paid_at": (timezone.now() + timedelta(days=1)).isoformat(),
            },
        ]:
            response = self.client.post(
                reverse("platform-invoice-record-payment", args=[invoice.pk]),
                payload,
                format="json",
            )
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Payment.objects.filter(invoice=invoice).exists())

    def test_payment_date_filter_includes_partial_payments_without_duplicates(self):
        from apps.billing.services import record_manual_payment

        invoice = self.make_invoice("200", 20)
        paid_at = timezone.now() - timedelta(days=2)
        record_manual_payment(invoice=invoice, amount="30", paid_at=paid_at)
        record_manual_payment(invoice=invoice, amount="40", paid_at=paid_at)
        params = {
            "date_field": "paid_at",
            "date_from": str(timezone.localdate() - timedelta(days=3)),
            "date_to": str(timezone.localdate()),
        }
        listing = self.client.get(reverse("platform-invoice-list"), params)
        dashboard = self.client.get(reverse("platform-finance-dashboard"), params)
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(dashboard.data["received_period"], Decimal(70))
        self.assertEqual(dashboard.data["receipts"][0]["amount"], Decimal(70))

    def test_invalid_dates_and_duplicate_search_items(self):
        from apps.billing.models import InvoiceItem

        invoice = self.make_invoice("100", description="Especial 1")
        InvoiceItem.objects.create(
            invoice=invoice,
            description="Especial 2",
            quantity=1,
            unit_amount=0,
            total=0,
        )
        self.assertEqual(
            self.client.get(
                reverse("platform-invoice-list"), {"search": "Especial"}
            ).data["count"],
            1,
        )
        for path in [
            "platform-finance-dashboard",
            "platform-invoice-list",
            "platform-invoice-report",
        ]:
            self.assertEqual(
                self.client.get(
                    reverse(path), {"date_from": "2026-10-20", "date_to": "2026-10-01"}
                ).status_code,
                400,
            )

    def test_export_contains_all_pages_and_respects_organization(self):
        from apps.billing.services import create_manual_invoice

        for index in range(3):
            self.make_invoice(str(index + 1))
        other = Organization.objects.create(name="Outro cliente", slug="outro-finance")
        create_manual_invoice(
            organization=other,
            due_date=timezone.localdate(),
            description="Outra organização",
            amount=Decimal(999),
        )
        params = {"organization": str(self.organization.pk), "page_size": 1, "page": 2}
        self.assertEqual(
            len(
                self.client.get(reverse("platform-invoice-list"), params).data[
                    "results"
                ]
            ),
            1,
        )
        report = self.client.get(reverse("platform-invoice-report"), params)
        self.assertEqual(len(report.data["invoices"]), 3)
        self.assertEqual(report.data["dashboard"]["billed"], Decimal(6))

    def test_customer_cannot_read_global_finance_or_export(self):
        customer = User.objects.create_user(
            email="finance-customer@test.local",
            role="admin",
            organization=self.organization,
        )
        self.client.force_authenticate(customer)
        for path in [
            "platform-finance-dashboard",
            "platform-invoice-list",
            "platform-invoice-report",
        ]:
            self.assertEqual(self.client.get(reverse(path)).status_code, 403)

    def test_mrr_accounts_for_discount_independently_of_period(self):
        subscription = self.organization.subscription
        subscription.discount_type = "percentage"
        subscription.discount_value = Decimal(10)
        subscription.save()
        response = self.client.get(
            reverse("platform-finance-dashboard"),
            {"date_from": "2000-01-01", "date_to": "2000-01-31"},
        )
        self.assertEqual(response.data["mrr"], Decimal("224.91"))
        self.assertEqual(response.data["received_period"], 0)
