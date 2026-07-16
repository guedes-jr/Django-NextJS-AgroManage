from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque
from apps.livestock.models import Animal, ClinicalRecord, Species
from apps.organizations.models import Organization

User = get_user_model()


class LivestockTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Rebanho A", slug="livestock-a-isolation")
        self.org_b = Organization.objects.create(name="Rebanho B", slug="livestock-b-isolation")
        self.user_a = User.objects.create_user(
            email="livestock-a@example.com", password="Password-8472", full_name="Rebanho A", organization=self.org_a
        )
        self.farm_a = Farm.objects.create(organization=self.org_a, name="Fazenda A")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.species = Species.objects.create(code="bovinos-isolation", name="Bovinos Isolamento")
        self.animal_a = Animal.objects.create(
            farm=self.farm_a, species=self.species, identifier="A-001", gender=Animal.Gender.FEMALE
        )
        self.animal_b = Animal.objects.create(
            farm=self.farm_b, species=self.species, identifier="B-001", gender=Animal.Gender.FEMALE
        )
        self.vaccine_b = ItemEstoque.objects.create(
            organization=self.org_b, nome="Vacina B", categoria="vacina", unidade_medida="dose"
        )
        self.clinical_b = ClinicalRecord.objects.create(
            farm=self.farm_b,
            animal=self.animal_b,
            record_type="consultation",
            record_date=date.today(),
            clinical_notes="Registro externo",
        )
        self.client.force_authenticate(self.user_a)

    def test_clinical_list_and_detail_hide_foreign_tenant(self):
        response = self.client.get(reverse("clinicalrecord-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.clinical_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("clinicalrecord-detail", args=[self.clinical_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_clinical_record_with_foreign_farm_and_animal(self):
        response = self.client.post(
            reverse("clinicalrecord-list"),
            {
                "farm": self.farm_b.id,
                "animal": self.animal_b.id,
                "record_type": "consultation",
                "record_date": date.today().isoformat(),
                "clinical_notes": "Tentativa externa",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_foreign_vaccine_item(self):
        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_name": "Vacina externa",
                "vaccine_item_id": self.vaccine_b.id,
                "application_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
