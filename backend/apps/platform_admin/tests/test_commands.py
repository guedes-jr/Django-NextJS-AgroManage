import os
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

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
