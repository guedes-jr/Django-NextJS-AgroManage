import uuid

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User

from ..models import AffiliateProfile, ReferralAttribution, ReferralVisit


class AffiliateTrackingAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.affiliate_user = User.objects.create_user(
            email="tracking-affiliate@example.com",
            password="password123",
            full_name="Tracking Affiliate",
        )
        cls.other_affiliate_user = User.objects.create_user(
            email="tracking-affiliate-2@example.com",
            password="password123",
            full_name="Other Tracking Affiliate",
        )
        cls.affiliate = AffiliateProfile.objects.create(
            user=cls.affiliate_user,
            commission_value="10.00",
        )
        cls.other_affiliate = AffiliateProfile.objects.create(
            user=cls.other_affiliate_user,
            commission_value="20.00",
        )

    def track(self, *, code=None, visitor_id=None):
        return self.client.post(
            reverse("affiliate-track"),
            {
                "code": code or self.affiliate.code,
                "visitor_id": str(visitor_id or uuid.uuid4()),
                "landing_path": "/cadastro?ref=TEST",
                "utm_source": "instagram",
            },
            format="json",
            HTTP_USER_AGENT="Affiliate test browser",
            REMOTE_ADDR="192.0.2.10",
        )

    def register(self, *, email, token=""):
        return self.client.post(
            reverse("auth_register"),
            {
                "email": email,
                "full_name": "Referred Customer",
                "password": "password123",
                "password_confirm": "password123",
                "referral_token": token,
            },
            format="json",
        )

    def test_tracks_first_touch_and_returns_signed_token(self):
        visitor_id = uuid.uuid4()
        response = self.track(visitor_id=visitor_id)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["attribution_token"])
        self.assertTrue(response.data["is_new_attribution"])
        attribution = ReferralAttribution.objects.get(visitor_id=visitor_id)
        self.assertEqual(attribution.affiliate, self.affiliate)
        visit = ReferralVisit.objects.get(visitor_id=visitor_id)
        self.assertEqual(visit.utm_source, "instagram")
        self.assertEqual(len(visit.ip_hash), 64)

    def test_second_link_preserves_first_affiliate_and_counts_visit(self):
        visitor_id = uuid.uuid4()
        first = self.track(visitor_id=visitor_id)
        second = self.track(code=self.other_affiliate.code, visitor_id=visitor_id)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data["is_new_attribution"])
        self.assertEqual(second.data["affiliate_code"], self.affiliate.code)
        self.assertEqual(ReferralVisit.objects.filter(visitor_id=visitor_id).count(), 2)

    def test_invalid_or_inactive_code_is_rejected(self):
        invalid = self.track(code="DOES-NOT-EXIST")
        self.affiliate.status = AffiliateProfile.Status.INACTIVE
        self.affiliate.save(update_fields=["status", "updated_at"])
        inactive = self.track()

        self.assertEqual(invalid.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(inactive.status_code, status.HTTP_404_NOT_FOUND)

    def test_registration_binds_user_and_organization(self):
        tracked = self.track()
        response = self.register(
            email="referred@example.com",
            token=tracked.data["attribution_token"],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        customer = User.objects.get(email="referred@example.com")
        attribution = customer.referral_attribution
        self.assertEqual(attribution.affiliate, self.affiliate)
        self.assertEqual(attribution.organization, customer.organization)
        self.assertEqual(attribution.status, ReferralAttribution.Status.REGISTERED)
        self.assertIsNotNone(attribution.registered_at)

    def test_invalid_token_does_not_block_registration(self):
        response = self.register(email="invalid-token@example.com", token="tampered-token")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        customer = User.objects.get(email="invalid-token@example.com")
        self.assertFalse(hasattr(customer, "referral_attribution"))

    @override_settings(AFFILIATE_ATTRIBUTION_MAX_AGE_SECONDS=-1)
    def test_expired_token_does_not_bind_registration(self):
        tracked = self.track()
        response = self.register(
            email="expired-token@example.com",
            token=tracked.data["attribution_token"],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        customer = User.objects.get(email="expired-token@example.com")
        self.assertFalse(hasattr(customer, "referral_attribution"))

    def test_registration_without_referral_keeps_existing_flow(self):
        response = self.register(email="organic@example.com")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        customer = User.objects.get(email="organic@example.com")
        self.assertIsNotNone(customer.organization)
        self.assertFalse(hasattr(customer, "referral_attribution"))
