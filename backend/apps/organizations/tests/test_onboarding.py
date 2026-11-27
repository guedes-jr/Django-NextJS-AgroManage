from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.billing.models import Coupon, DiscountKind, Invoice, PlanSegment, PlanTier, Subscription, SubscriptionTermsAcceptance
from apps.billing.onboarding import TERMS_VERSION
from apps.organizations.models import Organization

User = get_user_model()


class OnboardingFlowTests(APITestCase):
    def setUp(self):
        crops = PlanSegment.objects.get(code="plantacoes")
        crops.is_active = crops.is_public = True
        crops.save()
        crops.tiers.all().update(is_active=False)
        self.small = PlanTier.objects.create(segment=crops, label="Até 10 ha", minimum_quantity=1, maximum_quantity=10, monthly_price=Decimal("50.00"))
        self.big = PlanTier.objects.create(segment=crops, label="11 a 50 ha", minimum_quantity=11, maximum_quantity=50, monthly_price=Decimal("80.00"))
        response = self.client.post("/api/v1/auth/register/", {
            "email": "novo@example.com", "full_name": "Produtor Novo", "password": "SenhaForte123", "password_confirm": "SenhaForte123",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.user = User.objects.get(email="novo@example.com")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.subscription = self.user.organization.subscription

    def body(self, quantity=20, **extra):
        return {"segments": [{"segment_code": "plantacoes", "quantity": quantity}], "billing_cycle": "monthly", **extra}

    def test_self_service_signup_is_blocked_until_first_access(self):
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.data["access"]["access_stage"], "onboarding")
        blocked = self.client.get("/api/v1/farms/")
        self.assertEqual(blocked.status_code, 402)
        self.assertEqual(blocked.data["error"]["detail"]["code"], "onboarding_required")
        self.assertTrue(self.client.get("/api/v1/organizations/me/onboarding/").data["pending"])

    def test_platform_created_organization_skips_first_access(self):
        organization = Organization.objects.create(name="Fazenda da plataforma", slug="fazenda-plataforma")
        self.assertFalse(organization.subscription.onboarding_pending)
        self.assertEqual(organization.subscription.status, Subscription.Status.ACTIVE)

    def test_preview_prices_by_quantity_and_saves_nothing(self):
        items_before = list(self.subscription.items.values_list("segment_code", flat=True))
        response = self.client.post("/api/v1/organizations/me/onboarding/preview/", self.body(20), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["price"]["total"], "80.00")
        self.assertEqual(response.data["price"]["lines"][0]["quantity"], 20)
        self.assertEqual(response.data["trial_days"], 7)
        self.assertEqual(list(self.subscription.items.values_list("segment_code", flat=True)), items_before)

    def test_preview_reports_invalid_coupon_without_failing(self):
        response = self.client.post("/api/v1/organizations/me/onboarding/preview/", self.body(5, coupon="NAOEXISTE"), format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["price"]["total"], "50.00")
        self.assertTrue(response.data["coupon_error"])

    def test_quantity_is_required_for_sized_segment(self):
        response = self.client.post("/api/v1/organizations/me/onboarding/preview/", self.body(0), format="json")
        self.assertEqual(response.status_code, 400)

    def test_complete_requires_terms(self):
        response = self.client.post("/api/v1/organizations/me/onboarding/complete/", self.body(5), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Subscription.objects.get(pk=self.subscription.pk).onboarding_pending)

    def test_complete_keeps_only_chosen_segments_starts_trial_and_records_terms(self):
        Coupon.objects.create(code="BEMVINDO", kind=DiscountKind.PERCENTAGE, value=Decimal("10"), is_active=True)
        response = self.client.post("/api/v1/organizations/me/onboarding/complete/", self.body(
            5, coupon="bemvindo", accepted_terms=True, terms_version=TERMS_VERSION,
        ), format="json", HTTP_USER_AGENT="tests")
        self.assertEqual(response.status_code, 200, response.data)
        subscription = Subscription.objects.get(pk=self.subscription.pk)
        self.assertFalse(subscription.onboarding_pending)
        self.assertEqual(subscription.status, Subscription.Status.TRIALING)
        self.assertAlmostEqual(subscription.trial_ends_at, timezone.now() + timedelta(days=7), delta=timedelta(minutes=1))
        self.assertEqual(list(subscription.items.values_list("segment_code", flat=True)), ["plantacoes"])
        self.assertEqual(response.data["summary"]["price"]["total"], "45.00")
        acceptance = SubscriptionTermsAcceptance.objects.get(subscription=subscription)
        self.assertEqual((acceptance.terms_version, acceptance.user, acceptance.user_agent), (TERMS_VERSION, self.user, "tests"))
        self.assertEqual(acceptance.snapshot["price"]["total"], "45.00")
        access = self.client.get("/api/v1/auth/me/").data["access"]
        self.assertIsNone(access["access_stage"])
        self.assertEqual(access["segments"], ["plantacoes"])
        self.assertTrue(access["welcome_tour_pending"])
        # A second completion is refused.
        again = self.client.post("/api/v1/organizations/me/onboarding/complete/", self.body(5, accepted_terms=True, terms_version=TERMS_VERSION), format="json")
        self.assertEqual(again.status_code, 400)

    def test_member_cannot_complete_first_access(self):
        self.user.role = User.Role.MANAGER
        self.user.save(update_fields=["role"])
        response = self.client.post("/api/v1/organizations/me/onboarding/preview/", self.body(5), format="json")
        self.assertEqual(response.status_code, 403)

    def finish_onboarding(self):
        response = self.client.post("/api/v1/organizations/me/onboarding/complete/", self.body(5, accepted_terms=True, terms_version=TERMS_VERSION), format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def expire_trial(self):
        Subscription.objects.filter(pk=self.subscription.pk).update(trial_ends_at=timezone.now() - timedelta(minutes=1))

    def test_expired_trial_blocks_until_subscription(self):
        self.finish_onboarding()
        self.expire_trial()
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["access"]["access_stage"], "trial_expired")
        blocked = self.client.get("/api/v1/farms/")
        self.assertEqual(blocked.status_code, 402)
        self.assertEqual(blocked.data["error"]["detail"]["code"], "trial_expired")
        self.assertEqual(self.client.post("/api/v1/organizations/me/subscription/subscribe/", {}, format="json").status_code, 400)
        response = self.client.post("/api/v1/organizations/me/subscription/subscribe/", {"payment_method": "pix"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        subscription = Subscription.objects.get(pk=self.subscription.pk)
        self.assertEqual((subscription.status, subscription.preferred_payment_method), (Subscription.Status.ACTIVE, "pix"))
        self.assertIsNone(response.data["invoice"])  # automatic invoicing is off by default
        self.assertEqual(self.client.get("/api/v1/farms/").status_code, 200)

    @override_settings(BILLING_AUTO_INVOICING_ENABLED=True)
    def test_subscribing_issues_first_invoice_with_saved_method(self):
        self.finish_onboarding()
        saved = self.client.put("/api/v1/organizations/me/subscription/payment-method/", {"payment_method": "boleto"}, format="json")
        self.assertEqual(saved.status_code, 200)
        self.expire_trial()
        response = self.client.post("/api/v1/organizations/me/subscription/subscribe/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        invoice = Invoice.objects.get(pk=response.data["invoice"]["id"])
        self.assertEqual((invoice.total, invoice.due_date), (Decimal("50.00"), timezone.localdate()))
        subscription = Subscription.objects.get(pk=self.subscription.pk)
        self.assertEqual(subscription.preferred_payment_method, "boleto")
        self.assertGreater(subscription.current_period_ends_at, timezone.now())
