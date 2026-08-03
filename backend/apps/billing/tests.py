from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Plan


class PublicPlansAPITestCase(APITestCase):
    def test_lists_only_active_public_plans_without_internal_fields(self):
        Plan.objects.create(code="private-plan", name="Privado", is_public=False)
        Plan.objects.create(code="inactive-plan", name="Inativo", is_active=False)

        response = self.client.get(reverse("public-plans"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = {item["code"] for item in response.data}
        self.assertNotIn("private-plan", codes)
        self.assertNotIn("inactive-plan", codes)
        self.assertNotIn("subscriptions_count", response.data[0])
