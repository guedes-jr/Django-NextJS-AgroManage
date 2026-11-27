from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.billing.subscriptions import add_discount, set_segment_active, upsert_segment
from apps.organizations.models import Organization


class SubscriptionPayloadTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Assinatura", slug="assinatura-payload")
        self.admin = get_user_model().objects.create_user(email="adm@assinatura.local", password="Admin-8472x", full_name="Adm", organization=self.organization, role="admin")
        upsert_segment(self.organization.subscription, "plantacoes", final_monthly_price=Decimal("100.00"))
        self.client.force_authenticate(self.admin)

    def test_inactive_segments_are_hidden_and_price_is_itemized(self):
        set_segment_active(self.organization.subscription, "suinocultura", False)
        add_discount(self.organization.subscription, kind="percentage", value=10, description="Parceria")
        data = self.client.get("/api/v1/organizations/me/").data["subscription"]
        self.assertNotIn("suinocultura", [item["segment_code"] for item in data["items"]])
        self.assertNotIn("suinocultura", [line["segment_code"] for line in data["price"]["lines"]])
        self.assertEqual(data["price"]["subscription_discounts"][0]["description"], "Parceria")
        self.assertEqual(Decimal(data["price"]["total"]), Decimal(data["price"]["subtotal"]) * Decimal("0.9"))
