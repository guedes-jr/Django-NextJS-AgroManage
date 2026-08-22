import uuid

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.organizations.models import Organization

from ..models import AffiliateProfile, ReferralAttribution
from ..services import record_first_touch


class AffiliateMemberAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            email="member-affiliate@example.com",
            password="password123",
            full_name="Member Affiliate",
        )
        cls.affiliate = AffiliateProfile.objects.create(
            user=cls.user,
            commission_value="15.00",
        )
        cls.regular_user = User.objects.create_user(
            email="regular-member@example.com",
            password="password123",
            full_name="Regular Member",
        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def create_registered_referral(self):
        customer = User.objects.create_user(
            email="private-customer@example.com",
            password="password123",
            full_name="Maria da Silva",
        )
        organization = Organization.objects.create(name="Private Customer", slug="private-customer")
        customer.organization = organization
        customer.save(update_fields=["organization", "updated_at"])
        _, attribution, _ = record_first_touch(
            affiliate=self.affiliate,
            visitor_id=uuid.uuid4(),
        )
        attribution.user = customer
        attribution.organization = organization
        attribution.status = ReferralAttribution.Status.REGISTERED
        attribution.registered_at = timezone.now()
        attribution.save()
        return attribution

    def test_profile_and_dashboard_are_available_to_active_affiliate(self):
        self.create_registered_referral()

        profile = self.client.get(reverse("affiliate-me"))
        dashboard = self.client.get(reverse("affiliate-dashboard"))

        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.data["code"], self.affiliate.code)
        self.assertEqual(profile.data["referral_path"], f"/cadastro?ref={self.affiliate.code}")
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data["clicks"], 1)
        self.assertEqual(dashboard.data["unique_visitors"], 1)
        self.assertEqual(dashboard.data["registrations"], 1)

    def test_referral_list_masks_customer_personal_data(self):
        self.create_registered_referral()

        response = self.client.get(reverse("affiliate-referrals"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertEqual(item["customer"], "Maria S.")
        rendered = str(response.data)
        self.assertNotIn("private-customer@example.com", rendered)

    def test_regular_or_inactive_user_cannot_access_affiliate_area(self):
        self.client.force_authenticate(self.regular_user)
        regular = self.client.get(reverse("affiliate-dashboard"))
        self.affiliate.status = AffiliateProfile.Status.INACTIVE
        self.affiliate.save(update_fields=["status", "updated_at"])
        self.client.force_authenticate(self.user)
        inactive = self.client.get(reverse("affiliate-dashboard"))

        self.assertEqual(regular.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(inactive.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_serializer_exposes_affiliate_capability(self):
        response = self.client.get(reverse("auth_me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_affiliate"])

    def test_affiliate_can_read_and_update_own_account(self):
        response = self.client.patch(
            reverse("affiliate-account"),
            {
                "full_name": "Vendedor Atualizado",
                "phone": "85999999999",
                "theme": "dark",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.full_name, "Vendedor Atualizado")
        self.assertEqual(self.user.phone, "85999999999")
        self.assertEqual(self.user.theme, User.Theme.DARK)

    def test_affiliate_account_rejects_an_email_already_in_use(self):
        response = self.client.patch(
            reverse("affiliate-account"),
            {"email": self.regular_user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data["error"]["detail"])

    def test_password_change_updates_password_and_invalidates_sessions(self):
        response = self.client.post(
            reverse("affiliate-change-password"),
            {
                "current_password": "password123",
                "new_password": "NewSecurePassword987!",
                "new_password_confirm": "NewSecurePassword987!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["relogin_required"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecurePassword987!"))
        self.assertEqual(self.user.session_version, 1)
