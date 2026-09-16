from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.google_oauth import GoogleOAuthConfigurationError, GoogleOAuthError


User = get_user_model()


class GoogleLoginTests(APITestCase):
    @patch("apps.accounts.views.verify_google_credential")
    def test_creates_user_and_organization_for_valid_google_identity(self, verify):
        verify.return_value = {
            "sub": "google-user-1",
            "email": "produtor@example.com",
            "name": "Produtor Rural",
        }

        response = self.client.post(
            reverse("auth_google"),
            {"credential": "valid-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        user = User.objects.get(email="produtor@example.com")
        self.assertEqual(user.full_name, "Produtor Rural")
        self.assertEqual(user.role, User.Role.OWNER)
        self.assertIsNotNone(user.organization)
        self.assertFalse(user.has_usable_password())

    @patch("apps.accounts.views.verify_google_credential")
    def test_reuses_existing_account_with_same_verified_email(self, verify):
        existing = User.objects.create_user(
            email="existing@example.com",
            password="safe-password",
            full_name="Nome Existente",
        )
        verify.return_value = {
            "sub": "google-user-2",
            "email": "existing@example.com",
            "name": "Nome do Google",
        }

        response = self.client.post(
            reverse("auth_google"),
            {"credential": "valid-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.filter(email="existing@example.com").count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.full_name, "Nome Existente")
        self.assertIsNotNone(existing.organization)

    @patch("apps.accounts.views.verify_google_credential")
    def test_rejects_invalid_google_credential(self, verify):
        verify.side_effect = GoogleOAuthError("Credencial do Google inválida ou expirada.")

        response = self.client.post(
            reverse("auth_google"),
            {"credential": "invalid-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 0)

    @patch("apps.accounts.views.verify_google_credential")
    def test_reports_missing_server_configuration(self, verify):
        verify.side_effect = GoogleOAuthConfigurationError(
            "Login com Google não configurado no servidor."
        )

        response = self.client.post(
            reverse("auth_google"),
            {"credential": "token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
