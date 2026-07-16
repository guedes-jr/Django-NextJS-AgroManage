from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crops.models import AgronomistRecommendation, Field, PlantingCycle
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque
from apps.organizations.models import Organization

User = get_user_model()


class CropsTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Cultivos A", slug="crops-a-isolation")
        self.org_b = Organization.objects.create(name="Cultivos B", slug="crops-b-isolation")
        self.user_a = User.objects.create_user(
            email="crops-a@example.com", password="Password-8472", full_name="Cultivos A", organization=self.org_a
        )
        self.plantation_a = self.make_plantation(self.org_a, "A")
        self.plantation_b = self.make_plantation(self.org_b, "B")
        self.item_b = ItemEstoque.objects.create(
            organization=self.org_b, nome="Defensivo B", categoria="defensivo", unidade_medida="l"
        )
        self.recommendation_b = AgronomistRecommendation.objects.create(
            plantation=self.plantation_b,
            field=self.plantation_b.field,
            title="Recomendação B",
            recommendation_date=date.today(),
        )
        self.client.force_authenticate(self.user_a)

    @staticmethod
    def make_plantation(organization, suffix):
        farm = Farm.objects.create(organization=organization, name=f"Fazenda {suffix}")
        field = Field.objects.create(farm=farm, name=f"Talhão {suffix}", area_ha="10.00")
        return PlantingCycle.objects.create(
            organization=organization,
            farm=farm,
            field=field,
            name=f"Safra {suffix}",
            crop_name="Milho",
            planting_date=date.today(),
        )

    def test_recommendation_list_and_detail_hide_foreign_tenant(self):
        response = self.client.get(reverse("crops-agronomist-recommendations-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.recommendation_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(
            reverse("crops-agronomist-recommendations-detail", args=[self.recommendation_b.id])
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_foreign_plantation(self):
        response = self.client.post(
            reverse("crops-agronomist-recommendations-list"),
            {
                "plantation": self.plantation_b.id,
                "title": "Tentativa externa",
                "recommendation_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_product_from_foreign_inventory(self):
        response = self.client.post(
            reverse("crops-agronomist-recommendations-list"),
            {
                "plantation": self.plantation_a.id,
                "title": "Produto externo",
                "recommendation_date": date.today().isoformat(),
                "products": [{"item": self.item_b.id, "dose_per_ha": "1.00", "dose_unit": "l"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
