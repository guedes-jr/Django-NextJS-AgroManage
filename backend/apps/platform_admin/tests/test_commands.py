import os
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.organizations.models import Organization
from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class CreatePlatformStaffCommandTestCase(TestCase):
    @patch.dict(os.environ, {"TEST_PLATFORM_PASSWORD": "StrongPassword-8472"})
    def test_creates_platform_owner_from_password_environment_variable(self):
        output = StringIO()

        call_command(
            "create_platform_staff",
            email="owner@platform.local",
            name="Platform Owner",
            password_env="TEST_PLATFORM_PASSWORD",
            stdout=output,
        )

        user = User.objects.get(email="owner@platform.local")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.check_password("StrongPassword-8472"))
        self.assertEqual(
            user.platform_staff_profile.role,
            PlatformStaffProfile.Role.OWNER,
        )
        self.assertIn("Membro da plataforma criado", output.getvalue())

    @patch.dict(os.environ, {"TEST_PLATFORM_PASSWORD": "StrongPassword-8472"})
    def test_created_staff_logs_in_with_email_and_password(self):
        call_command(
            "create_platform_staff",
            email="Joao.Admin@agro.com",
            name="João Guedes",
            password_env="TEST_PLATFORM_PASSWORD",
        )
        client = APIClient()

        login = client.post(
            reverse("auth_login"),
            {"email": "joao.admin@agro.com", "password": "StrongPassword-8472"},
            format="json",
        )

        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn("access", login.data)
        user = User.objects.get(email__iexact="joao.admin@agro.com")
        self.assertIsNone(user.organization)

        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        identity = client.get(reverse("platform-me"))
        self.assertEqual(identity.status_code, status.HTTP_200_OK)
        self.assertEqual(identity.data["email"].lower(), "joao.admin@agro.com")

    @patch.dict(os.environ, {"TEST_PLATFORM_PASSWORD": "StrongPassword-8472"})
    def test_rejects_customer_account(self):
        organization = Organization.objects.create(name="Cliente", slug="cliente")
        User.objects.create_user(
            email="customer@example.com",
            password="CustomerPassword-8472",
            full_name="Customer",
            organization=organization,
        )

        with self.assertRaisesMessage(CommandError, "organização cliente"):
            call_command(
                "create_platform_staff",
                email="customer@example.com",
                name="Customer",
                password_env="TEST_PLATFORM_PASSWORD",
            )

    @patch.dict(os.environ, {}, clear=True)
    @patch("sys.stdin.isatty", return_value=False)
    def test_requires_password_without_interactive_terminal(self, _isatty):
        with self.assertRaisesMessage(CommandError, "PLATFORM_STAFF_PASSWORD"):
            call_command(
                "create_platform_staff",
                email="owner@platform.local",
                name="Platform Owner",
            )
