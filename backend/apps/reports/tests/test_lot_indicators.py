from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.inventory.models import ConsumoRacao, ItemEstoque
from apps.livestock.models import AnimalBatch, BatchPhaseHistory, HistoricoEvento, Species, WeightRecord
from apps.organizations.models import Organization


class SwineLotIndicatorsTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Lotes", slug="lot-indicators")
        self.other = Organization.objects.create(name="Outra", slug="other-lot-indicators")
        self.farm = Farm.objects.create(organization=self.org, name="Granja")
        self.other_farm = Farm.objects.create(organization=self.other, name="Outra")
        self.species = Species.objects.create(code="suinos", name="Suínos")
        self.user = get_user_model().objects.create_user(role="admin", email="lots@example.com", password="test", organization=self.org)
        self.client.force_authenticate(self.user)
        self.start = date(date.today().year - 1, 1, 1)
        self.end = self.start + timedelta(days=60)
        self.feed = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", especie_animal="suino", unidade_medida="kg")

    def batch(self, code="C001", farm=None, quantity=90):
        batch = AnimalBatch.objects.create(farm=farm or self.farm, species=self.species, batch_code=code,
            phase="creche", category="Leitão", quantity=quantity, entry_date=self.start, avg_weight_kg=30)
        BatchPhaseHistory.objects.create(batch=batch, phase="creche", quantity=100, avg_weight_kg=20, entry_date=self.start)
        return batch

    def report(self, **params):
        response = self.client.get(reverse("livestock-lot-indicators-report"),
            {"start": self.start.isoformat(), "end": self.end.isoformat(), **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_indicators_follow_weights_feed_and_deaths(self):
        batch = self.batch()
        WeightRecord.objects.create(batch=batch, farm=self.farm, species=self.species, weighing_date=self.start+timedelta(days=10), weight_kg=30)
        ConsumoRacao.objects.create(organization=self.org, farm=self.farm, lote_animal=batch, item_estoque=self.feed,
            data_inicio=self.start, data_fim=self.start+timedelta(days=10), quantidade=1800, custo_total=900)
        HistoricoEvento.objects.create(farm=self.farm, lote=batch, tipo_evento="Mortalidade de Lote",
            data_evento=self.start+timedelta(days=5), metadata={"quantidade_mortes": 10})
        data = self.report()
        self.assertEqual(data["lots"], 1)
        self.assertEqual(data["initial_quantity"], 100)
        self.assertEqual(data["initial_weight_kg"], 20)
        self.assertEqual(data["current_quantity"], 90)
        self.assertEqual(data["current_weight_kg"], 30)
        self.assertEqual(data["daily_gain_kg"], 1)
        self.assertEqual(data["total_gain_kg"], 900)
        self.assertEqual(data["feed_conversion"], 2)
        self.assertEqual(data["mortality_pct"], 10)
        self.assertEqual(data["feed_kg"], 1800)
        self.assertEqual(data["feed_cost"], 900)
        self.assertEqual(data["cost_per_kg_gain"], 1)
        self.assertEqual(data["feed_per_animal_day_kg"], 1800 / (60 * 90))

    def test_batch_filter_and_organization_isolation(self):
        first, second = self.batch("C001"), self.batch("C002", quantity=50)
        self.batch("X001", farm=self.other_farm)
        self.assertEqual(self.report()["lots"], 2)
        data = self.report(batches=str(second.pk))
        self.assertEqual(data["lots"], 1)
        self.assertEqual(data["current_quantity"], 50)
        self.assertIsNone(data["daily_gain_kg"])
        self.assertEqual(self.report(batches="")["lots"], 0)
        self.assertNotEqual(first.pk, second.pk)

    def test_invalid_period_is_rejected(self):
        response = self.client.get(reverse("livestock-lot-indicators-report"), {"start": "2025-02-01", "end": "2025-01-01"})
        self.assertEqual(response.status_code, 400)
        response = self.client.get(reverse("livestock-lot-indicators-report"), {"start": "2025-01-01", "end": "2025-02-01", "batches": "x"})
        self.assertEqual(response.status_code, 400)
