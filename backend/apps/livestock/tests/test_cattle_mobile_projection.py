from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.livestock.models import Animal, AnimalBatch, Species, WeightRecord, HistoricoEvento


class CattleMobileProjectionTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Mobile", slug="mobile-cattle-projection")
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="mobile-cattle@example.invalid", password="test", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.animal = self.make_animal("0007", "beef")

    def make_animal(self, identifier, purpose, farm=None):
        return Animal.objects.create(farm=farm or self.farm, species=self.species, identifier=identifier, cattle_purpose=purpose, gender="F", category="Vaca", entry_date=self.today)

    def test_operational_animals_keep_production_farm_and_tenant_scope(self):
        self.make_animal("LEITE", "dairy")
        self.make_animal("DUPLA", "dual")
        other_farm = Farm.objects.create(organization=self.org, name="Outra propriedade")
        self.make_animal("OUTRA-FARM", "beef", other_farm)
        foreign_org = Organization.objects.create(name="Outra", slug="mobile-cattle-foreign")
        self.make_animal("EXTERNO", "beef", Farm.objects.create(organization=foreign_org, name="Externa"))
        response = self.client.get(reverse("cattle-animal-list"), {"view": "operational", "production": "beef", "farm": self.farm.pk, "page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertNotIn("reproductive_cycles", response.data["results"][0])
        detail = self.client.get(reverse("cattle-animal-detail", args=[self.animal.pk]), {"view": "operational", "production": "dairy"})
        self.assertEqual(detail.status_code, 404)

    def test_batch_operational_projection_excludes_prices_without_changing_legacy(self):
        batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="LOTE-7", cattle_purpose="beef", category="Vaca", phase="reproducao", quantity=10, entry_date=self.today, purchase_value=Decimal("123.45"))
        url = reverse("cattle-batch-detail", args=[batch.pk])
        self.assertIn("purchase_value", self.client.get(url).data)
        projected = self.client.get(url, {"view": "operational", "production": "beef"})
        self.assertEqual(projected.status_code, 200)
        self.assertNotIn("purchase_value", projected.data)
        self.assertNotIn("operations", projected.data)
        self.assertEqual(projected.data["quantity"], 10)

    def test_history_opt_in_pagination_and_projection_keep_legacy_array(self):
        WeightRecord.objects.create(farm=self.farm, species=self.species, animal=self.animal, weighing_date=self.today, weight_kg=Decimal("310.25"))
        HistoricoEvento.objects.create(farm=self.farm, matriz=self.animal, tipo_evento="Observação", data_evento=self.today, descricao="Conferência", metadata={"cost": "123.45"})
        url = reverse("cattle-animal-full-history", args=[self.animal.pk])
        legacy = self.client.get(url)
        self.assertEqual(legacy.status_code, 200)
        self.assertIsInstance(legacy.data, list)
        self.assertEqual(len(legacy.data), 2)
        projected = self.client.get(url, {"production": "beef", "view": "operational", "page": 1, "page_size": 1})
        self.assertEqual(projected.status_code, 200)
        self.assertEqual(projected.data["count"], 2)
        self.assertEqual(len(projected.data["results"]), 1)
        self.assertEqual(set(projected.data["results"][0]), {"type", "date", "title", "subtitle"})
        second = self.client.get(url, {"production": "beef", "view": "operational", "page": 2, "page_size": 1})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(set(second.data["results"][0]), {"type", "date", "title", "subtitle"})
        self.assertNotIn("metadata", second.data["results"][0])

    def test_operator_without_bovine_scope_cannot_read_projection(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        url = reverse("cattle-animal-list")
        self.assertEqual(self.client.get(url, {"view": "operational", "production": "beef"}).status_code, 403)
        self.user.allowed_livestock.add(self.species)
        self.assertEqual(self.client.get(url, {"view": "operational", "production": "beef"}).status_code, 200)
