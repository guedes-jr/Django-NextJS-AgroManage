from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class OperationsHealthAPITestCase(APITestCase):
    def test_developer_can_read_health_without_exposing_errors(self):
        user = User.objects.create_user(email="dev@platform.local", password="DevPassword-8472", full_name="Dev")
        PlatformStaffProfile.objects.create(user=user, role=PlatformStaffProfile.Role.DEVELOPER)
        self.client.force_authenticate(user=user)

        with patch("redis.Redis.ping", side_effect=ConnectionError("secret-host")):
            response = self.client.get(reverse("platform-operations-health"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["checks"]["database"]["status"], "healthy")
        self.assertEqual(response.data["checks"]["redis"], {"status": "unavailable"})

    def test_support_cannot_read_technical_health(self):
        user = User.objects.create_user(email="support-health@platform.local", password="SupportPassword-8472", full_name="Support")
        PlatformStaffProfile.objects.create(user=user, role=PlatformStaffProfile.Role.SUPPORT)
        self.client.force_authenticate(user=user)
        self.assertEqual(self.client.get(reverse("platform-operations-health")).status_code, status.HTTP_403_FORBIDDEN)
