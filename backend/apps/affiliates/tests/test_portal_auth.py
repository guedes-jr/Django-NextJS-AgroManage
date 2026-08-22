from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User

from ..models import AffiliateProfile


class AffiliatePortalAuthenticationTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.seller = User.objects.create_user(
            email="portal-seller@example.com",
            password="SellerPassword123",
            full_name="Portal Seller",
        )
        cls.affiliate = AffiliateProfile.objects.create(
            user=cls.seller,
            portal_access_only=True,
            commission_value="10.00",
        )
        cls.regular_user = User.objects.create_user(
            email="portal-regular@example.com",
            password="RegularPassword123",
            full_name="Portal Regular",
        )

    def test_dedicated_seller_logs_in_to_affiliate_portal(self):
        response = self.client.post(
            reverse("affiliate-portal-login"),
            {"email": self.seller.email, "password": "SellerPassword123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["access"])
        self.assertTrue(response.data["refresh"])
        self.assertEqual(response.data["affiliate"]["code"], self.affiliate.code)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        dashboard = self.client.get(reverse("affiliate-dashboard"))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)

    def test_dedicated_seller_is_rejected_by_customer_login(self):
        response = self.client.post(
            reverse("auth_login"),
            {"email": self.seller.email, "password": "SellerPassword123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("portal de afiliados", str(response.data))
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.organization)

    def test_regular_user_cannot_use_affiliate_portal_login(self):
        response = self.client.post(
            reverse("affiliate-portal-login"),
            {"email": self.regular_user.email, "password": "RegularPassword123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_affiliate_cannot_use_portal(self):
        self.affiliate.status = AffiliateProfile.Status.INACTIVE
        self.affiliate.save(update_fields=["status", "updated_at"])
        response = self.client.post(
            reverse("affiliate-portal-login"),
            {"email": self.seller.email, "password": "SellerPassword123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
