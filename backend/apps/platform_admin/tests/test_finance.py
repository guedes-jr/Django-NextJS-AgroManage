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
            email="finance-admin@platform.local", password="PlatformPassword-8472",
            full_name="Finance Admin", is_staff=True,
        )
        PlatformStaffProfile.objects.create(user=self.admin, role=PlatformStaffProfile.Role.ADMIN)
        self.organization = Organization.objects.create(name="Cliente Finance", slug="cliente-finance")
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
            }, format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        invoice = Invoice.objects.get(pk=create_response.data["id"])
        self.assertEqual(invoice.items.count(), 1)

        payment_response = self.client.post(
            reverse("platform-invoice-record-payment", args=[invoice.id]),
            {"amount": "249.90", "payment_method": "pix"}, format="json",
        )
        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertEqual(Payment.objects.filter(invoice=invoice).count(), 1)
        self.assertTrue(PlatformAuditLog.objects.filter(action="payment.recorded").exists())

    def test_finance_dashboard_calculates_mrr(self):
        response = self.client.get(reverse("platform-finance-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mrr"], Decimal("249.90"))
        self.assertEqual(response.data["active_subscriptions"], 1)
