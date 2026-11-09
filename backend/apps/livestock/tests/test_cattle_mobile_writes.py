from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.organizations.models import Organization
from apps.livestock.models import Animal, AnimalBatch, Species, WeightRecord


class CattleMobileWritesTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.organization = Organization.objects.create(name="Mobile escrita", slug="mobile-cattle-writes")
        self.farm = Farm.objects.create(name="Fazenda", organization=self.organization)
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="cattle-writes@example.invalid", password="test", role="manager", organization=self.organization)
        self.client.force_authenticate(self.user)

    def values(self, **changes):
        return dict(dict(identifier="0009", name="Nativa", farm_id=str(self.farm.pk), cattle_purpose="beef", species_code_input="bovinos", gender="F", category="Novilha", birth_date=None, entry_date=str(self.today - timedelta(days=2)), breed_name_input="Mestiça", initial_weight_kg="100.25", notes=""), **changes)

    def create_animal(self):
        response = self.client.post(reverse("cattle-animal-list"), self.values(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Animal.objects.get(pk=response.data["id"])

    def test_native_create_edit_payload_preserves_initial_weight_and_unknown_birth(self):
        animal = self.create_animal()
        self.assertEqual(animal.identifier, "0009")
        self.assertIsNone(animal.birth_date)
        self.assertEqual(animal.current_weight_kg, Decimal("100.25"))
        self.assertEqual(animal.weights.count(), 1)
        response = self.client.patch(reverse("cattle-animal-detail", args=[animal.pk]), {"identifier": "0010", "name": "Editada", "gender": "F", "category": "Novilha", "birth_date": None, "entry_date": str(animal.entry_date), "notes": "Atualizada"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        animal.refresh_from_db()
        self.assertEqual(animal.farm, self.farm)
        self.assertEqual(animal.cattle_purpose, "beef")
        self.assertEqual(animal.initial_weight_kg, Decimal("100.25"))
        self.assertEqual(animal.weights.count(), 1)
        duplicate = self.client.post(reverse("cattle-animal-list"), self.values(identifier="0010"), format="json")
        self.assertEqual(duplicate.status_code, 400)

    def test_animal_and_batch_weighing_reject_bad_dates_and_preserve_latest_weight(self):
        animal = self.create_animal()
        batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="LOTE-9", cattle_purpose="beef", quantity=10, category="Novilha", phase="crescimento", entry_date=self.today-timedelta(days=2))
        for target, route in [(animal, "cattle-animal-register-weight"), (batch, "cattle-batch-register-weight")]:
            url = reverse(route, args=[target.pk])
            query = "?production=beef&farm=" + str(self.farm.pk)
            latest = self.client.post(url + query, {"weight_kg": "200.25", "weighing_date": str(self.today), "notes": "Atual"}, format="json")
            self.assertEqual(latest.status_code, 201, latest.data)
            historical = self.client.post(url + query, {"weight_kg": "180.50", "weighing_date": str(self.today-timedelta(days=1)), "notes": "Histórico"}, format="json")
            self.assertEqual(historical.status_code, 201, historical.data)
            target.refresh_from_db()
            self.assertEqual(target.current_weight_kg if isinstance(target, Animal) else target.avg_weight_kg, Decimal("200.25"))
            before_count = WeightRecord.objects.count()
            for values in [{"weight_kg": "0", "weighing_date": str(self.today)}, {"weight_kg": "100.123", "weighing_date": str(self.today)}, {"weight_kg": "100", "weighing_date": str(self.today+timedelta(days=1))}, {"weight_kg": "100", "weighing_date": str(self.today-timedelta(days=3))}]:
                self.assertEqual(self.client.post(url + query, values, format="json").status_code, 400)
            self.assertEqual(WeightRecord.objects.count(), before_count)

    def test_operator_with_bovine_scope_can_create_and_weigh(self):
        self.user.role = "operator"
        self.user.save(update_fields=["role"])
        self.user.allowed_livestock.add(self.species)
        animal = self.create_animal()
        response = self.client.post(reverse("cattle-animal-register-weight", args=[animal.pk]) + "?production=beef&farm=" + str(self.farm.pk), {"weight_kg": "200.25", "weighing_date": str(self.today), "notes": "Conferência"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        animal.refresh_from_db()
        self.assertEqual(animal.current_weight_kg, Decimal("200.25"))

    def test_readonly_operator_cannot_create_or_weigh(self):
        animal = self.create_animal()
        self.user.role = "operator"
        self.user.operator_read_only = True
        self.user.save(update_fields=["role", "operator_read_only"])
        self.user.allowed_livestock.add(self.species)
        count = WeightRecord.objects.count()
        response = self.client.post(reverse("cattle-animal-register-weight", args=[animal.pk]), {"weight_kg": "200", "weighing_date": str(self.today)}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post(reverse("cattle-animal-list"), self.values(identifier="OUTRO"), format="json").status_code, 403)
        self.assertEqual(WeightRecord.objects.count(), count)

    def test_native_batch_create_and_edit_keep_quantity_and_unknown_acquisition_value(self):
        values = dict(farm_id=str(self.farm.pk), cattle_purpose="beef", batch_code="MOBILE-1", name="", category="Bezerro", gender="Misto", phase="creche", origin="purchased", quantity=10, entry_date=str(self.today), birth_date=None, avg_weight_kg="200.25", notes="")
        response = self.client.post(reverse("cattle-batch-list"), values, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        batch = AnimalBatch.objects.get(pk=response.data["id"])
        self.assertIsNone(batch.purchase_value)
        self.assertIsNone(batch.birth_date)
        self.assertEqual(batch.avg_weight_kg, Decimal("200.25"))
        url = reverse("cattle-batch-detail", args=[batch.pk]) + "?production=beef&farm=" + str(self.farm.pk)
        edited = self.client.patch(url, dict(batch_code="MOBILE-2", name="Atualizado", birth_date=None, notes="Conferido"), format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        rejected = self.client.patch(url, {"quantity": 9}, format="json")
        self.assertEqual(rejected.status_code, 400)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 10)
        self.assertEqual(batch.batch_code, "MOBILE-2")
        self.assertIsNone(batch.purchase_value)
        self.assertEqual(batch.farm, self.farm)
        overview = self.client.get(reverse("cattle-overview"), {"production": "beef", "farm": str(self.farm.pk)})
        self.assertEqual(overview.status_code, 200, overview.data)
        self.assertEqual(overview.data["total_head"], 10)
        self.assertEqual(overview.data["active_batches"], 1)
