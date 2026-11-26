from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import Coupon
from apps.billing.pricing import breakdown, monthly_total
from apps.billing.segments import contracted_segments
from apps.billing.subscriptions import add_discount, redeem_coupon, remove_segment, set_segment_active, upsert_segment
from apps.organizations.models import Organization


class PricingTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Preço", slug="preco")
        self.subscription = self.organization.subscription
        # Two priced segments: crops R$ 100, swine R$ 50 (cattle segments stay on request = R$ 0).
        upsert_segment(self.subscription, "plantacoes", final_monthly_price=Decimal("100.00"))
        upsert_segment(self.subscription, "suinocultura", final_monthly_price=Decimal("50.00"))

    def total(self):
        return monthly_total(self.subscription)

    def test_new_organization_contracts_base_segments(self):
        self.assertEqual(contracted_segments(self.organization), {"plantacoes", "gado-de-corte", "pecuaria-leiteira", "suinocultura"})
        self.assertEqual(self.total(), Decimal("150.00"))

    def test_order_segment_then_subscription(self):
        add_discount(self.subscription, kind="percentage", value=10, segment_code="plantacoes", description="Seg")
        add_discount(self.subscription, kind="fixed_amount", value=20, description="Valor")
        add_discount(self.subscription, kind="percentage", value=10, description="Percentual")
        # crops 100 → 90; subtotal 140 → 10% = 126 → −20 = 106
        self.assertEqual(self.total(), Decimal("106.00"))
        self.assertEqual(Decimal(breakdown(self.subscription)["discount_total"]), Decimal("44.00"))

    def test_fixed_price_and_exemption(self):
        add_discount(self.subscription, kind="fixed_price", value=30, segment_code="suinocultura", description="Fixo")
        self.assertEqual(self.total(), Decimal("130.00"))
        add_discount(self.subscription, kind="exemption", description="Organização de teste")
        self.assertEqual(self.total(), Decimal("0.00"))

    def test_never_negative_and_expired_or_revoked_ignored(self):
        add_discount(self.subscription, kind="fixed_amount", value=999, description="Grande")
        self.assertEqual(self.total(), Decimal("0.00"))
        self.subscription.discounts.update(revoked_at=timezone.now())
        add_discount(self.subscription, kind="fixed_amount", value=10, description="Vencido", starts_at=timezone.now() - timedelta(days=60), months=1)
        self.assertEqual(self.total(), Decimal("150.00"))

    def test_non_cumulative_promotion_keeps_best_option(self):
        add_discount(self.subscription, kind="percentage", value=10, source="referral", description="Indicação")
        add_discount(self.subscription, kind="percentage", value=30, source="coupon", cumulative=False, description="Cupom")
        # Either 10% (cumulative) or 30% alone: 30% wins → 105.
        self.assertEqual(self.total(), Decimal("105.00"))

    def test_coupon_limits(self):
        Coupon.objects.create(code="bemvindo", kind="percentage", value=20, max_redemptions=1, duration_months=3)
        discount = redeem_coupon(self.subscription, "BEMVINDO")
        self.assertIsNotNone(discount.ends_at)
        self.assertEqual(self.total(), Decimal("120.00"))
        other = Organization.objects.create(name="Outra", slug="outra-preco")
        with self.assertRaises(ValidationError):
            redeem_coupon(other.subscription, "bemvindo")

    def test_keeps_at_least_one_active_segment(self):
        remove_segment(self.subscription, "gado-de-corte")
        remove_segment(self.subscription, "pecuaria-leiteira")
        remove_segment(self.subscription, "suinocultura")
        with self.assertRaises(ValidationError):
            remove_segment(self.subscription, "plantacoes")
        with self.assertRaises(ValidationError):
            set_segment_active(self.subscription, "plantacoes", False)

    def test_inactive_segment_is_hidden_and_not_charged_but_keeps_price(self):
        set_segment_active(self.subscription, "suinocultura", False)
        self.assertNotIn("suinocultura", contracted_segments(self.organization))
        self.assertEqual(self.total(), Decimal("100.00"))
        item = set_segment_active(self.subscription, "suinocultura", True)
        self.assertEqual(item.final_monthly_price, Decimal("50.00"))
        self.assertEqual(self.total(), Decimal("150.00"))
