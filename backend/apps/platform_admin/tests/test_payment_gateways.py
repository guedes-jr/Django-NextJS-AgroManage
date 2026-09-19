from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import PaymentGatewayConfiguration
from apps.platform_admin.models import PlatformAuditLog, PlatformStaffProfile


User = get_user_model()


class PlatformPaymentGatewayTests(APITestCase):
    def setUp(self):
        admin = User.objects.create_user(email="gateway-admin@platform.local", password="StrongPassword-123", full_name="Gateway Admin", is_staff=True)
        PlatformStaffProfile.objects.create(user=admin, role=PlatformStaffProfile.Role.ADMIN)
        self.client.force_authenticate(admin)
        self.gateway, _ = PaymentGatewayConfiguration.objects.update_or_create(
            provider="gerencianet",
            defaults={"display_name": "Gerencianet / Efí", "environment": "sandbox"},
        )

    def test_credentials_are_saved_without_being_returned(self):
        response = self.client.patch(reverse("platform-payment-gateway-detail", args=[self.gateway.id]), {
            "credentials": {"client_id": "client", "client_secret": "secret", "certificate_pem": "certificate", "private_key_pem": "key", "webhook_secret": "webhook"},
            "settings": {"pix_key": "pix@example.com"},
            "is_enabled": True,
            "is_default": True,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.gateway.refresh_from_db()
        self.assertTrue(response.data["credential_configured"])
        self.assertNotIn("credentials", response.data)
        self.assertNotIn("secret", self.gateway.encrypted_credentials)
        self.assertTrue(self.gateway.is_default)
        self.assertTrue(PlatformAuditLog.objects.filter(action="billing.gateway_updated").exists())

    def test_cannot_make_unconfigured_gateway_default(self):
        response = self.client.patch(reverse("platform-payment-gateway-detail", args=[self.gateway.id]), {
            "is_enabled": True,
            "is_default": True,
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
